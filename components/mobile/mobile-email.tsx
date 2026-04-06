"use client";

import { useState, useCallback, useMemo } from "react";
import { ChevronLeft, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { StoredEmail, EmailTaskSuggestion } from "@/lib/db/emails";

interface Project {
  id: string;
  title: string;
  client: string | null;
  color: string;
}

interface Phase {
  id: string;
  name: string;
  project_id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

interface Task {
  id: string;
  title: string;
  due_date: string | null;
  project_id: string | null;
}

interface Props {
  initialEmails: StoredEmail[];
  initialTaskSuggestions: EmailTaskSuggestion[];
  projects: Project[];
  phases: Phase[];
  tasks: Task[];
  hasToneProfile: boolean;
  initialFilterAddresses: string[];
  calendarConnected: boolean;
  userEmail: string;
}

function getThreads(emails: StoredEmail[]) {
  const threadMap = new Map<string, StoredEmail[]>();
  for (const email of emails) {
    const key = email.gmail_thread_id ?? email.gmail_message_id;
    if (!threadMap.has(key)) threadMap.set(key, []);
    threadMap.get(key)!.push(email);
  }
  return Array.from(threadMap.entries())
    .map(([threadId, messages]) => {
      const sorted = messages.sort(
        (a, b) => new Date(a.received_at ?? a.created_at).getTime() - new Date(b.received_at ?? b.created_at).getTime()
      );
      const latest = sorted[sorted.length - 1];
      return {
        threadId,
        subject: latest.subject,
        from: latest.from_email,
        fromName: latest.from_name ?? latest.from_email,
        snippet: latest.snippet ?? "",
        date: latest.received_at ?? latest.created_at,
        messages: sorted,
        isUnread: !latest.is_read,
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getInitials(name: string) {
  return name
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function MobileEmail({
  initialEmails,
  initialTaskSuggestions,
  projects,
  phases,
  tasks,
  hasToneProfile,
  initialFilterAddresses,
  calendarConnected,
  userEmail,
}: Props) {
  const [emails, setEmails] = useState(initialEmails);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [taskSuggestions] = useState(initialTaskSuggestions);

  const threads = useMemo(() => getThreads(emails), [emails]);

  const filteredThreads = useMemo(() => {
    if (!search) return threads;
    const q = search.toLowerCase();
    return threads.filter(
      (t) =>
        t.subject?.toLowerCase().includes(q) ||
        t.fromName?.toLowerCase().includes(q) ||
        t.snippet?.toLowerCase().includes(q)
    );
  }, [threads, search]);

  const selectedThread = useMemo(
    () => threads.find((t) => t.threadId === selectedThreadId) ?? null,
    [threads, selectedThreadId]
  );

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/email/sync", { method: "POST" });
      if (!res.ok) throw new Error("Sync failed");
      const data = await res.json();
      if (data.emails) setEmails(data.emails);
      toast.success(`Synced ${data.count ?? 0} emails`);
    } catch {
      toast.error("Email sync failed");
    } finally {
      setSyncing(false);
    }
  }, []);

  // ── Thread list view ──
  if (!selectedThread) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="shrink-0 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-background/80 backdrop-blur-xl border-b border-border/30">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-black tracking-tight">Email</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSync}
                className={cn(
                  "w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors",
                  syncing && "animate-spin"
                )}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Search emails..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-[13px] bg-muted/30 border border-border/30 rounded-lg placeholder:text-muted-foreground/40"
            />
          </div>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-auto">
          {filteredThreads.map((thread) => (
            <button
              key={thread.threadId}
              onClick={() => setSelectedThreadId(thread.threadId)}
              className={cn(
                "w-full flex items-start gap-3 px-5 py-3.5 text-left border-b border-border/20 active:bg-accent/20 transition-colors",
                thread.isUnread && "bg-primary/[0.03]"
              )}
            >
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-muted-foreground">
                  {getInitials(thread.fromName)}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      "text-[13px] truncate",
                      thread.isUnread ? "font-bold text-foreground" : "font-medium text-foreground/80"
                    )}
                  >
                    {thread.fromName}
                  </p>
                  <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                    {formatTime(thread.date)}
                  </span>
                </div>
                <p
                  className={cn(
                    "text-[12px] truncate",
                    thread.isUnread ? "font-semibold text-foreground/90" : "text-muted-foreground"
                  )}
                >
                  {thread.subject || "(no subject)"}
                </p>
                <p className="text-[11px] text-muted-foreground/50 truncate mt-0.5">
                  {thread.snippet}
                </p>
              </div>

              {thread.isUnread && (
                <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
              )}
            </button>
          ))}

          {filteredThreads.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-[13px] text-muted-foreground">
                {search ? "No matching emails" : "No emails yet. Tap sync to pull from Gmail."}
              </p>
            </div>
          )}
        </div>

      </div>
    );
  }

  // ── Thread detail view (self-contained mobile renderer) ──
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-background/80 backdrop-blur-xl border-b border-border/30">
        <button
          onClick={() => setSelectedThreadId(null)}
          className="w-8 h-8 flex items-center justify-center text-muted-foreground"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-[13px] font-semibold truncate flex-1">
          {selectedThread.subject || "(no subject)"}
        </h2>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
        {selectedThread.messages.map((msg) => (
          <div
            key={msg.gmail_message_id}
            className={cn(
              "border border-border/30 rounded-lg overflow-hidden",
              msg.is_sent ? "bg-primary/[0.03]" : "bg-card/30"
            )}
          >
            {/* Message header */}
            <div className="flex items-start gap-3 px-4 py-3 border-b border-border/20">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-muted-foreground">
                  {getInitials(msg.from_name ?? msg.from_email)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-foreground truncate">
                  {msg.from_name ?? msg.from_email}
                </p>
                <p className="text-[10px] text-muted-foreground/60">
                  {formatTime(msg.received_at ?? msg.created_at)}
                </p>
              </div>
            </div>

            {/* Message body */}
            <div className="px-4 py-3">
              {msg.body_html ? (
                <div
                  className="text-[13px] leading-relaxed text-foreground prose-notes max-w-none [&_img]:max-w-full [&_a]:text-primary [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: msg.body_html }}
                />
              ) : (
                <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
                  {msg.body_text ?? msg.snippet ?? ""}
                </p>
              )}
            </div>

            {/* Attachments */}
            {msg.attachments && msg.attachments.length > 0 && (
              <div className="px-4 pb-3 flex flex-wrap gap-2">
                {msg.attachments.map((att, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] bg-muted/30 border border-border/30 rounded text-muted-foreground"
                  >
                    {att.filename ?? `Attachment ${i + 1}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
