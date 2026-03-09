"use client";

import { useState } from "react";
import { Search, RefreshCw, CheckCircle2, X, ListChecks, ChevronDown, Settings2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { StoredEmail, EmailTaskSuggestion } from "@/lib/db/emails";
import { TaskFilterSettings, type KnownSender } from "./task-filter-settings";

interface Project {
  id: string;
  title: string;
}

interface EmailThread {
  threadId: string;
  subject: string;
  fromEmail: string;
  fromName: string | null;
  snippet: string;
  receivedAt: string | null;
  isRead: boolean;
  messageCount: number;
  latestMessageId: string;
}

interface EmailListPanelProps {
  emails: StoredEmail[];
  selectedThreadId: string | null;
  taskSuggestions: EmailTaskSuggestion[];
  projects: Project[];
  isSyncing: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  onSelectThread: (threadId: string, latestMessageId: string) => void;
  onSync: () => void;
  onApproveTask: (suggestion: EmailTaskSuggestion) => void;
  onDismissTask: (id: string) => void;
  // Task extraction filter
  filterAddresses: string[];
  onFilterChange: (addresses: string[]) => void;
  isFilterSaving?: boolean;
}

function buildThreads(emails: StoredEmail[]): EmailThread[] {
  const map = new Map<string, EmailThread>();
  const sorted = [...emails].sort(
    (a, b) => new Date(b.received_at ?? 0).getTime() - new Date(a.received_at ?? 0).getTime()
  );
  for (const e of sorted) {
    if (!map.has(e.gmail_thread_id)) {
      map.set(e.gmail_thread_id, {
        threadId: e.gmail_thread_id,
        subject: e.subject ?? "(No subject)",
        fromEmail: e.from_email,
        fromName: e.from_name,
        snippet: e.snippet ?? "",
        receivedAt: e.received_at,
        isRead: e.is_read,
        messageCount: 1,
        latestMessageId: e.id,
      });
    } else {
      map.get(e.gmail_thread_id)!.messageCount += 1;
    }
  }
  return Array.from(map.values());
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();
  if (isToday) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isThisYear) return date.toLocaleDateString([], { month: "short", day: "numeric" });
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
}

function getAvatarColor(name: string): string {
  const palette = ["#3b82f6","#8b5cf6","#10b981","#ec4899","#f97316","#06b6d4","#84cc16","#ef4444"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0x7fffffff;
  return palette[h % palette.length];
}

const PRIORITY_RING: Record<string, string> = {
  high: "text-red-400",
  medium: "text-foreground/70",
  low: "text-muted-foreground/50",
};

export function EmailListPanel({
  emails,
  selectedThreadId,
  taskSuggestions,
  projects,
  isSyncing,
  search,
  onSearchChange,
  onSelectThread,
  onSync,
  onApproveTask,
  onDismissTask,
  filterAddresses,
  onFilterChange,
  isFilterSaving,
}: EmailListPanelProps) {
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Unique senders from synced emails (for autocomplete)
  const knownSenders: KnownSender[] = Array.from(
    emails
      .filter((e) => !e.is_sent && e.from_email)
      .reduce((map, e) => {
        if (!map.has(e.from_email)) {
          map.set(e.from_email, { email: e.from_email, name: e.from_name });
        }
        return map;
      }, new Map<string, KnownSender>())
      .values()
  ).sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));

  const allThreads = buildThreads(emails.filter((e) => !e.is_sent));
  const filtered = search.trim()
    ? allThreads.filter(
        (t) =>
          t.subject.toLowerCase().includes(search.toLowerCase()) ||
          t.fromEmail.toLowerCase().includes(search.toLowerCase()) ||
          (t.fromName ?? "").toLowerCase().includes(search.toLowerCase()) ||
          t.snippet.toLowerCase().includes(search.toLowerCase())
      )
    : allThreads;

  const pendingCount = taskSuggestions.length;

  return (
    <div className="flex flex-col h-full border-r border-border">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-3 py-3 border-b border-border space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-foreground uppercase tracking-widest">
            Inbox
          </span>
          <div className="flex items-center gap-2">
            {/* Task badge */}
            {pendingCount > 0 && (
              <button
                onClick={() => { setTaskDrawerOpen((v) => !v); setSettingsOpen(false); }}
                className={cn(
                  "flex items-center gap-1 text-[10px] font-medium px-2 py-1 border transition-colors",
                  taskDrawerOpen
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "bg-sidebar-accent/50 border-border text-foreground/70 hover:border-primary/30 hover:text-foreground"
                )}
              >
                <ListChecks className="w-3 h-3" />
                {pendingCount} task{pendingCount !== 1 ? "s" : ""}
                <ChevronDown className={cn("w-2.5 h-2.5 transition-transform", taskDrawerOpen && "rotate-180")} />
              </button>
            )}
            {/* Settings gear */}
            <button
              onClick={() => { setSettingsOpen((v) => !v); setTaskDrawerOpen(false); }}
              title="Task extraction settings"
              className={cn(
                "flex items-center justify-center w-6 h-6 transition-colors",
                settingsOpen
                  ? "text-primary"
                  : "text-muted-foreground/50 hover:text-foreground"
              )}
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
            {/* Sync button */}
            <button
              onClick={onSync}
              disabled={isSyncing}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              title="Sync from Gmail"
            >
              <RefreshCw className={cn("w-3 h-3", isSyncing && "animate-spin")} />
              {isSyncing ? "Syncing…" : "Sync"}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40" />
          <input
            type="text"
            placeholder="Search emails…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-7 pr-2.5 py-1.5 text-xs bg-sidebar-accent/30 border border-border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40 transition-colors"
          />
        </div>
      </div>

      {/* ── Task suggestion drawer ──────────────────────────────────────── */}
      <AnimatePresence>
        {taskDrawerOpen && pendingCount > 0 && (
          <motion.div
            key="task-drawer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden border-b border-border/60 bg-sidebar-accent/20 shrink-0"
          >
            <div className="max-h-64 overflow-y-auto">
              {taskSuggestions.map((s, i) => {
                const project = projects.find((p) => p.id === s.project_id);
                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-start gap-2 px-3 py-2.5 border-b border-border/30 last:border-0 hover:bg-sidebar-accent/40 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-[11px] font-medium leading-snug line-clamp-2", PRIORITY_RING[s.priority] ?? "text-foreground/70")}>
                        {s.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.5 font-semibold uppercase tracking-wide border",
                          s.priority === "high" ? "text-red-400 border-red-400/30 bg-red-400/5"
                          : s.priority === "low" ? "text-muted-foreground border-border/50"
                          : "text-foreground/60 border-border/50"
                        )}>
                          {s.priority}
                        </span>
                        {project && (
                          <span className="text-[10px] text-muted-foreground/60 truncate max-w-[100px]">
                            {project.title}
                          </span>
                        )}
                        {s.due_hint && (
                          <span className="text-[10px] text-muted-foreground/50">{s.due_hint}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 pt-0.5">
                      <button
                        onClick={() => onApproveTask(s)}
                        title="Add to tasks"
                        className="w-6 h-6 flex items-center justify-center text-muted-foreground/40 hover:text-green-400 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDismissTask(s.id)}
                        title="Dismiss"
                        className="w-6 h-6 flex items-center justify-center text-muted-foreground/40 hover:text-foreground transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Settings drawer ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            key="settings-drawer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden border-b border-border/60 bg-sidebar-accent/10 shrink-0"
          >
            <TaskFilterSettings
              addresses={filterAddresses}
              knownSenders={knownSenders}
              onChange={onFilterChange}
              isSaving={isFilterSaving}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Thread list ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-xs text-muted-foreground/40">
              {emails.length === 0 ? "No emails synced yet. Click Sync." : "No results."}
            </p>
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.03 } } }}
          >
            {filtered.map((thread) => {
              const isSelected = selectedThreadId === thread.threadId;
              const senderName = thread.fromName || thread.fromEmail;
              const avatarColor = getAvatarColor(senderName);
              const hasPendingTasks = taskSuggestions.some((s) =>
                emails.some((e) => e.gmail_thread_id === thread.threadId && e.id === s.email_id)
              );

              return (
                <motion.button
                  key={thread.threadId}
                  variants={{
                    hidden: { opacity: 0, y: 6 },
                    show: { opacity: 1, y: 0, transition: { duration: 0.18 } },
                  }}
                  onClick={() => onSelectThread(thread.threadId, thread.latestMessageId)}
                  className={cn(
                    "w-full text-left px-3 py-3 border-b border-border/30 transition-colors flex items-start gap-2.5",
                    isSelected
                      ? "bg-sidebar-accent border-l-[3px] border-l-primary"
                      : "hover:bg-sidebar-accent/40 border-l-[3px] border-l-transparent"
                  )}
                >
                  {/* Avatar */}
                  <div
                    className="w-8 h-8 flex items-center justify-center text-[12px] font-bold text-white shrink-0 mt-0.5"
                    style={{ backgroundColor: avatarColor }}
                  >
                    {senderName.charAt(0).toUpperCase()}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span
                        className={cn(
                          "text-xs truncate",
                          thread.isRead ? "text-muted-foreground" : "text-foreground font-semibold"
                        )}
                      >
                        {senderName}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50 shrink-0">
                        {formatDate(thread.receivedAt)}
                      </span>
                    </div>
                    <p className="text-[11px] text-foreground/70 truncate">{thread.subject}</p>
                    <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">
                      {thread.snippet}
                    </p>
                    {/* Badges row */}
                    {(thread.messageCount > 1 || hasPendingTasks) && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {thread.messageCount > 1 && (
                          <span className="text-[10px] text-muted-foreground/50 border border-border/40 px-1.5 py-px">
                            {thread.messageCount}
                          </span>
                        )}
                        {hasPendingTasks && (
                          <span className="text-[10px] text-primary border border-primary/30 bg-primary/5 px-1.5 py-px font-medium">
                            tasks
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
