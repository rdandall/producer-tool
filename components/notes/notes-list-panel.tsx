"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Mic, AlignLeft, Users, FolderOpen, Search, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteNoteAction } from "@/app/actions";
import type { Note, NoteType } from "@/lib/db/notes";

const TYPE_CONFIG: Record<NoteType | "notes", { label: string; icon: typeof FileText; color: string }> = {
  "brief":          { label: "Edit Brief",     icon: FileText,   color: "text-primary" },
  "meeting-notes":  { label: "Meeting Notes",  icon: Mic,        color: "text-amber-500" },
  "project-notes":  { label: "Project Notes",  icon: AlignLeft,  color: "text-blue-500" },
  "client-brief":   { label: "Client Brief",   icon: Users,      color: "text-purple-500" },
  "notes":          { label: "Notes",          icon: AlignLeft,  color: "text-muted-foreground" },
};

type FilterType = NoteType | "all";

interface Props {
  notes: Note[];
  selectedId: string | null;
  onSelect: (note: Note) => void;
  onNew: () => void;
}

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

export function NotesListPanel({ notes, selectedId, onSelect, onNew }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filters: { key: FilterType; label: string }[] = [
    { key: "all",           label: "All" },
    { key: "brief",         label: "Briefs" },
    { key: "meeting-notes", label: "Meetings" },
    { key: "project-notes", label: "Projects" },
    { key: "client-brief",  label: "Client" },
  ];

  const filtered = notes.filter((n) => {
    const matchesFilter = filter === "all" || n.type === filter;
    const matchesSearch =
      !search ||
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content?.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await deleteNoteAction(id);
    } finally {
      setDeletingId(null);
    }
  }

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
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-transparent border border-border/60 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1 px-3 py-2 border-b border-border/50 overflow-x-auto shrink-0 scrollbar-none">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "text-[10px] px-2 py-0.5 whitespace-nowrap font-medium transition-colors shrink-0",
              filter === f.key
                ? "bg-foreground text-background"
                : "text-muted-foreground/40 hover:text-foreground hover:bg-accent/40"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-auto">
        <AnimatePresence initial={false}>
          {filtered.length === 0 ? (
            <div className="py-12 text-center px-4">
              <p className="text-xs text-muted-foreground/40">
                {search ? "No notes match your search" : "No notes yet"}
              </p>
            </div>
          ) : (
            filtered.map((note) => {
              const config = TYPE_CONFIG[note.type] ?? TYPE_CONFIG["notes"];
              const Icon = config.icon;
              const isSelected = note.id === selectedId;
              const isDeleting = note.id === deletingId;

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
                  {/* Type + time */}
                  <div className="flex items-center justify-between gap-2">
                    <div className={cn("flex items-center gap-1.5", config.color)}>
                      <Icon className="w-3 h-3 shrink-0" />
                      <span className="text-[10px] font-medium uppercase tracking-wide">
                        {config.label}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/30 shrink-0">
                      {timeAgo(note.updated_at)}
                    </span>
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
