"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Mic, AlignLeft, Users, FolderOpen,
  Search, Plus, Trash2, Quote, Lightbulb, ClipboardList, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteNoteAction } from "@/app/actions";
import type { Note, NoteType, NoteStatus } from "@/lib/db/notes-types";

// ── Type config ───────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  "brief":          { label: "Edit Brief",     icon: FileText,     color: "text-primary" },
  "meeting-notes":  { label: "Meeting Notes",  icon: Mic,          color: "text-amber-500" },
  "project-notes":  { label: "Project Notes",  icon: AlignLeft,    color: "text-blue-500" },
  "client-brief":   { label: "Client Brief",   icon: Users,        color: "text-purple-500" },
  "notes":          { label: "Notes",          icon: AlignLeft,    color: "text-muted-foreground" },
  "note":           { label: "Note",           icon: AlignLeft,    color: "text-muted-foreground" },
  "quote":          { label: "Quote",          icon: Quote,        color: "text-green-500" },
  "idea":           { label: "Idea",           icon: Lightbulb,    color: "text-yellow-500" },
  "spec":           { label: "Spec",           icon: ClipboardList, color: "text-cyan-500" },
  "project-update": { label: "Project Update", icon: RefreshCw,    color: "text-orange-500" },
};

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<NoteStatus, string> = {
  draft: "text-muted-foreground/40",
  saved: "text-blue-500/70",
  sent:  "text-green-500/80",
};
const STATUS_LABELS: Record<NoteStatus, string> = {
  draft: "draft",
  saved: "saved",
  sent:  "sent",
};

// ── Filter config ────────────────────────────────────────────────────────────

type TypeFilter   = NoteType | "all";
type StatusFilter = NoteStatus | "all";

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: "all",            label: "All" },
  { key: "brief",          label: "Briefs" },
  { key: "meeting-notes",  label: "Meetings" },
  { key: "project-notes",  label: "Projects" },
  { key: "client-brief",   label: "Client" },
  { key: "quote",          label: "Quotes" },
  { key: "idea",           label: "Ideas" },
  { key: "spec",           label: "Specs" },
  { key: "project-update", label: "Updates" },
];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all",   label: "All" },
  { key: "draft", label: "Draft" },
  { key: "saved", label: "Saved" },
  { key: "sent",  label: "Sent" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  notes: Note[];
  selectedId: string | null;
  onSelect: (note: Note) => void;
  onNew: () => void;
  /** Called with updated list when server search returns results */
  onSearchResults?: (notes: Note[]) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NotesListPanel({ notes, selectedId, onSelect, onNew, onSearchResults }: Props) {
  const [search,       setSearch]       = useState("");
  const [typeFilter,   setTypeFilter]   = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [isSearching,  setIsSearching]  = useState(false);
  const [searchResults, setSearchResults] = useState<Note[] | null>(null); // null = show all

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Server-side search (debounced 300ms) ────────────────────────────────
  const runSearch = useCallback(async (
    q: string,
    type: TypeFilter,
    status: StatusFilter,
  ) => {
    const params = new URLSearchParams();
    if (q)             params.set("q",      q);
    if (type   !== "all") params.set("type",   type);
    if (status !== "all") params.set("status", status);

    setIsSearching(true);
    try {
      const res = await fetch(`/api/notes/search?${params.toString()}`);
      if (!res.ok) throw new Error("Search failed");
      const { notes: results } = await res.json() as { notes: Note[] };
      setSearchResults(results);
      onSearchResults?.(results);
    } catch {
      // Fall back to client-side filtering — don't show error to user
      setSearchResults(null);
    } finally {
      setIsSearching(false);
    }
  }, [onSearchResults]);

  function scheduleSearch(q: string, type: TypeFilter, status: StatusFilter) {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    // If all filters are default, clear search results immediately
    if (!q && type === "all" && status === "all") {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimerRef.current = setTimeout(() => {
      void runSearch(q, type, status);
    }, 300);
  }

  function handleSearchChange(q: string) {
    setSearch(q);
    scheduleSearch(q, typeFilter, statusFilter);
  }

  function handleTypeFilter(type: TypeFilter) {
    setTypeFilter(type);
    scheduleSearch(search, type, statusFilter);
  }

  function handleStatusFilter(status: StatusFilter) {
    setStatusFilter(status);
    scheduleSearch(search, typeFilter, status);
  }

  // ── Determine which notes to display ────────────────────────────────────
  // Use server results when available; otherwise fall back to client-side filter
  const displayNotes = searchResults !== null
    ? searchResults
    : notes.filter((n) => {
        const matchesType   = typeFilter   === "all" || n.type   === typeFilter;
        const matchesStatus = statusFilter === "all" || n.status === statusFilter;
        const matchesSearch = !search ||
          n.title.toLowerCase().includes(search.toLowerCase()) ||
          n.content?.toLowerCase().includes(search.toLowerCase());
        return matchesType && matchesStatus && matchesSearch;
      });

  // ── Delete ───────────────────────────────────────────────────────────────
  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await deleteNoteAction(id);
      // Remove from local search results if present
      if (searchResults !== null) {
        setSearchResults((prev) => prev?.filter((n) => n.id !== id) ?? null);
      }
    } finally {
      setDeletingId(null);
    }
  }

  const hasActiveFilter = search || typeFilter !== "all" || statusFilter !== "all";

  return (
    <div className="w-full md:w-64 shrink-0 flex flex-col border-r border-border overflow-hidden">
      {/* Panel header */}
      <div className="px-4 h-14 flex items-center justify-between border-b border-border shrink-0">
        <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/60">
          Notes
        </span>
        <button
          onClick={onNew}
          className="w-6 h-6 flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-colors"
          title="New note"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5 border-b border-border/50 shrink-0">
        <div className="relative">
          <Search className={cn(
            "absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 transition-colors",
            isSearching ? "text-primary animate-pulse" : "text-muted-foreground/40"
          )} />
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search notes, projects, files…"
            className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-transparent border border-border/60 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary transition-colors"
          />
          {search && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-foreground transition-colors text-[10px]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Type filter pills */}
      <div className="flex gap-1 px-3 py-1.5 border-b border-border/50 overflow-x-auto shrink-0 scrollbar-none">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => handleTypeFilter(f.key)}
            className={cn(
              "text-[10px] px-2 py-0.5 whitespace-nowrap font-medium transition-colors shrink-0",
              typeFilter === f.key
                ? "bg-foreground text-background"
                : "text-muted-foreground/40 hover:text-foreground hover:bg-accent/40"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Status filter pills */}
      <div className="flex gap-1 px-3 py-1.5 border-b border-border/30 overflow-x-auto shrink-0 scrollbar-none">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => handleStatusFilter(f.key)}
            className={cn(
              "text-[10px] px-2 py-0.5 whitespace-nowrap font-medium transition-colors shrink-0",
              statusFilter === f.key
                ? "bg-foreground/10 text-foreground border border-foreground/20"
                : "text-muted-foreground/30 hover:text-foreground hover:bg-accent/30"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-auto">
        <AnimatePresence initial={false}>
          {displayNotes.length === 0 ? (
            <div className="py-12 text-center px-4">
              <p className="text-xs text-muted-foreground/40">
                {hasActiveFilter
                  ? isSearching
                    ? "Searching…"
                    : "No notes match"
                  : "No notes yet"}
              </p>
            </div>
          ) : (
            displayNotes.map((note) => {
              const config  = TYPE_CONFIG[note.type] ?? TYPE_CONFIG["notes"];
              const Icon    = config.icon;
              const isSelected = note.id === selectedId;
              const isDeleting = note.id === deletingId;
              const status     = (note.status ?? "draft") as NoteStatus;

              return (
                <motion.div
                  key={note.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: isDeleting ? 0.4 : 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => onSelect(note)}
                  className={cn(
                    "group relative flex flex-col gap-1 px-4 py-3 cursor-pointer border-b border-border/40 transition-colors",
                    isSelected
                      ? "bg-accent/40 border-l-2 border-l-primary pl-3.5"
                      : "hover:bg-accent/20"
                  )}
                >
                  {/* Type + time + status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className={cn("flex items-center gap-1.5", config.color)}>
                      <Icon className="w-3 h-3 shrink-0" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">
                        {config.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {status !== "draft" && (
                        <span className={cn(
                          "text-[9px] uppercase tracking-wide font-semibold",
                          STATUS_STYLES[status]
                        )}>
                          {STATUS_LABELS[status]}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground/30">
                        {timeAgo(note.updated_at)}
                      </span>
                    </div>
                  </div>

                  {/* Title */}
                  <p className="text-[12px] font-medium text-foreground truncate leading-snug">
                    {note.title}
                  </p>

                  {/* Preview */}
                  {note.content && (
                    <p className="text-[11px] text-muted-foreground/50 truncate leading-snug">
                      {note.content.replace(/^#+\s*/gm, "").replace(/\*\*/g, "").slice(0, 60)}
                    </p>
                  )}

                  {/* Project badge */}
                  {note.projects && (
                    <div
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 w-fit"
                      style={{
                        color: note.projects.color,
                        backgroundColor: `${note.projects.color}15`,
                        border: `1px solid ${note.projects.color}30`,
                      }}
                    >
                      <FolderOpen className="w-2.5 h-2.5" />
                      {note.projects.client ?? note.projects.title}
                    </div>
                  )}

                  {/* Delete button (hover) */}
                  <button
                    onClick={(e) => handleDelete(e, note.id)}
                    disabled={isDeleting}
                    className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 p-1 text-muted-foreground/30 hover:text-destructive transition-all"
                    title="Delete note"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
