"use client";

import { Search, RefreshCw, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StoredEmail, EmailTaskSuggestion } from "@/lib/db/emails";
import { TaskSuggestionQueue } from "./task-suggestion-queue";

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
}

function buildThreads(emails: StoredEmail[]): EmailThread[] {
  const threadMap = new Map<string, EmailThread>();

  // Process newest-first so the "latest" is the first we see
  const sorted = [...emails].sort(
    (a, b) =>
      new Date(b.received_at ?? 0).getTime() - new Date(a.received_at ?? 0).getTime()
  );

  for (const email of sorted) {
    if (!threadMap.has(email.gmail_thread_id)) {
      threadMap.set(email.gmail_thread_id, {
        threadId: email.gmail_thread_id,
        subject: email.subject ?? "(No subject)",
        fromEmail: email.from_email,
        fromName: email.from_name,
        snippet: email.snippet ?? "",
        receivedAt: email.received_at,
        isRead: email.is_read,
        messageCount: 1,
        latestMessageId: email.id,
      });
    } else {
      // Increment message count for already-seen threads
      const existing = threadMap.get(email.gmail_thread_id)!;
      existing.messageCount += 1;
    }
  }

  return Array.from(threadMap.values());
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (isThisYear) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
}

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
}: EmailListPanelProps) {
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

  return (
    <div className="flex flex-col h-full border-r border-border">
      {/* Header */}
      <div className="px-3 py-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-foreground uppercase tracking-wide">
            Inbox
          </span>
          <button
            onClick={onSync}
            disabled={isSyncing}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Sync from Gmail"
          >
            <RefreshCw className={cn("w-3 h-3", isSyncing && "animate-spin")} />
            {isSyncing ? "Syncing..." : "Sync"}
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search emails..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-sidebar-accent/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-xs text-muted-foreground">
              {emails.length === 0
                ? "No emails synced yet. Click Sync."
                : "No results found."}
            </p>
          </div>
        ) : (
          filtered.map((thread) => {
            const isSelected = selectedThreadId === thread.threadId;
            const pendingCount = taskSuggestions.filter((s) =>
              emails.some(
                (e) =>
                  e.gmail_thread_id === thread.threadId && e.id === s.email_id
              )
            ).length;

            return (
              <button
                key={thread.threadId}
                onClick={() => onSelectThread(thread.threadId, thread.latestMessageId)}
                className={cn(
                  "w-full text-left px-3 py-3 border-b border-border/50 transition-colors",
                  isSelected
                    ? "bg-sidebar-accent border-l-2 border-l-primary"
                    : "hover:bg-sidebar-accent/50 border-l-2 border-l-transparent"
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {!thread.isRead && (
                      <Circle className="w-1.5 h-1.5 fill-primary text-primary shrink-0" />
                    )}
                    <span
                      className={cn(
                        "text-xs truncate",
                        thread.isRead
                          ? "text-muted-foreground"
                          : "text-foreground font-medium"
                      )}
                    >
                      {thread.fromName || thread.fromEmail}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDate(thread.receivedAt)}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-foreground truncate">{thread.subject}</p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {thread.snippet}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {thread.messageCount > 1 && (
                      <span className="text-[10px] text-muted-foreground">
                        {thread.messageCount}
                      </span>
                    )}
                    {pendingCount > 0 && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5">
                        {pendingCount} task{pendingCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Task suggestion queue */}
      <TaskSuggestionQueue
        suggestions={taskSuggestions}
        projects={projects}
        onApprove={onApproveTask}
        onDismiss={onDismissTask}
      />
    </div>
  );
}
