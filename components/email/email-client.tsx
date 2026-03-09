"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { toast } from "sonner";
import type { StoredEmail, EmailTaskSuggestion } from "@/lib/db/emails";
import {
  approveEmailTaskSuggestionAction,
  dismissEmailTaskSuggestionAction,
  updatePhaseStatusAction,
} from "@/app/actions";
import { EmailListPanel } from "./email-list-panel";
import { EmailThreadPanel } from "./email-thread-panel";
import { EmailComposePanel } from "./email-compose-panel";

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

interface DateConflict {
  mentionedDate: string;
  mentionedContext: string;
  conflictType: "phase" | "task" | "calendar";
  conflictName: string;
  conflictDetails: string;
}

interface PhaseSignal {
  detected: boolean;
  description: string;
  suggestedAction: string;
  phaseId: string | null;
}

interface EmailClientProps {
  initialEmails: StoredEmail[];
  initialTaskSuggestions: EmailTaskSuggestion[];
  projects: Project[];
  phases: Phase[];
  tasks: Task[];
  hasToneProfile: boolean;
}

/** Client-side date extraction (regex-based, instant) */
function extractDatesFromText(
  text: string
): Array<{ raw: string; date: Date; context: string }> {
  const results: Array<{ raw: string; date: Date; context: string }> = [];
  const now = new Date();

  // "Month DD" or "Month DD, YYYY" — e.g. "March 15" / "March 15, 2026"
  const re1 =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/gi;
  let match: RegExpExecArray | null;

  while ((match = re1.exec(text)) !== null) {
    const year = match[3] ? parseInt(match[3]) : now.getFullYear();
    const date = new Date(`${match[1]} ${match[2]}, ${year}`);
    if (!isNaN(date.getTime())) {
      results.push({
        raw: match[0],
        date,
        context: text.slice(Math.max(0, match.index - 40), match.index + 60),
      });
    }
  }

  // ISO: YYYY-MM-DD
  const re2 = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((match = re2.exec(text)) !== null) {
    const date = new Date(match[0]);
    if (!isNaN(date.getTime())) {
      results.push({
        raw: match[0],
        date,
        context: text.slice(Math.max(0, match.index - 40), match.index + 60),
      });
    }
  }

  // Numeric: MM/DD/YYYY or MM/DD/YY
  const re3 = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
  while ((match = re3.exec(text)) !== null) {
    const yr =
      match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3]);
    const date = new Date(yr, parseInt(match[1]) - 1, parseInt(match[2]));
    if (!isNaN(date.getTime())) {
      results.push({
        raw: match[0],
        date,
        context: text.slice(Math.max(0, match.index - 40), match.index + 60),
      });
    }
  }

  return results;
}

function checkConflicts(
  extractedDates: Array<{ raw: string; date: Date; context: string }>,
  phases: Phase[],
  tasks: Task[]
): DateConflict[] {
  const conflicts: DateConflict[] = [];

  for (const { raw, date, context } of extractedDates) {
    // Check phases
    for (const phase of phases) {
      if (!phase.start_date) continue;
      const start = new Date(phase.start_date);
      const end = phase.end_date ? new Date(phase.end_date) : start;
      if (date >= start && date <= end) {
        conflicts.push({
          mentionedDate: raw,
          mentionedContext: context,
          conflictType: "phase",
          conflictName: phase.name,
          conflictDetails: `${phase.start_date} – ${phase.end_date ?? phase.start_date} (${phase.status})`,
        });
      }
    }

    // Check tasks (±1 day)
    for (const task of tasks) {
      if (!task.due_date) continue;
      const taskDate = new Date(task.due_date);
      const diff = Math.abs(date.getTime() - taskDate.getTime());
      if (diff <= 86_400_000) {
        conflicts.push({
          mentionedDate: raw,
          mentionedContext: context,
          conflictType: "task",
          conflictName: task.title,
          conflictDetails: `Task due on ${task.due_date}`,
        });
      }
    }
  }

  // Deduplicate by mentionedDate + conflictName
  return conflicts.filter(
    (c, i, arr) =>
      arr.findIndex(
        (x) => x.mentionedDate === c.mentionedDate && x.conflictName === c.conflictName
      ) === i
  );
}

export function EmailClient({
  initialEmails,
  initialTaskSuggestions,
  projects,
  phases,
  tasks,
  hasToneProfile,
}: EmailClientProps) {
  const [emails, setEmails] = useState(initialEmails);
  const [taskSuggestions, setTaskSuggestions] = useState(initialTaskSuggestions);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [dateConflicts, setDateConflicts] = useState<DateConflict[]>([]);
  const [phaseSignal, setPhaseSignal] = useState<PhaseSignal | null>(null);
  const [conflictsDismissed, setConflictsDismissed] = useState(false);
  const [phaseSignalDismissed, setPhaseSignalDismissed] = useState(false);

  // Messages for the selected thread
  const threadMessages = useMemo(
    () =>
      selectedThreadId
        ? emails
            .filter((e) => e.gmail_thread_id === selectedThreadId)
            .sort(
              (a, b) =>
                new Date(a.received_at ?? 0).getTime() -
                new Date(b.received_at ?? 0).getTime()
            )
        : [],
    [emails, selectedThreadId]
  );

  const handleSync = useCallback(async (silent = false) => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/email/sync", { method: "POST" });
      if (!res.ok) throw new Error("Sync failed");
      const { synced, emails: freshEmails } = await res.json();

      // Update state in-place — no page reload needed
      if (freshEmails) setEmails(freshEmails);

      if (!silent) {
        if (synced > 0) {
          toast.success(`Synced ${synced} new email${synced !== 1 ? "s" : ""}`);
        } else {
          toast.info("Inbox is up to date");
        }
      } else if (synced > 0) {
        toast.success(`${synced} new email${synced !== 1 ? "s" : ""}`, { id: "bg-sync" });
      }
    } catch {
      if (!silent) toast.error("Sync failed — check your Gmail connection");
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Auto-sync on mount (rate-limited to once per 60s via sessionStorage)
  useEffect(() => {
    const key = "prdcr-email-last-sync";
    const last = sessionStorage.getItem(key);
    const now = Date.now();
    if (!last || now - parseInt(last) > 60_000) {
      sessionStorage.setItem(key, String(now));
      handleSync(true);
    }
  }, [handleSync]);

  // Periodic background sync every 2 minutes (only when tab is visible)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) handleSync(true);
    }, 120_000);
    return () => clearInterval(interval);
  }, [handleSync]);

  const handleSelectThread = useCallback(
    (threadId: string) => {
      setSelectedThreadId(threadId);
      setComposeOpen(false);
      setConflictsDismissed(false);
      setPhaseSignalDismissed(false);
      setPhaseSignal(null);
      setDateConflicts([]);

      // Instantly check for date conflicts in the thread
      const threadEmails = emails
        .filter((e) => e.gmail_thread_id === threadId)
        .sort(
          (a, b) =>
            new Date(a.received_at ?? 0).getTime() -
            new Date(b.received_at ?? 0).getTime()
        );

      const allText = threadEmails
        .map((e) => e.body_text ?? e.snippet ?? "")
        .join(" ");

      const extracted = extractDatesFromText(allText);
      if (extracted.length > 0) {
        const conflicts = checkConflicts(extracted, phases, tasks);
        if (conflicts.length > 0) setDateConflicts(conflicts);
      }

      // Trigger task extraction for the latest email in the thread (non-blocking)
      const latestEmail = threadEmails[threadEmails.length - 1];
      if (
        latestEmail &&
        !latestEmail.is_sent &&
        !taskSuggestions.some((s) => s.email_id === latestEmail.id)
      ) {
        fetch("/api/email/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emailId: latestEmail.id,
            emailContent: latestEmail.body_text ?? latestEmail.snippet ?? "",
            subject: latestEmail.subject,
            fromEmail: latestEmail.from_email,
            projects,
          }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.inserted > 0) {
              // Refresh task suggestions
              return fetch("/api/email/tasks").then(() => {
                toast.info(`${d.inserted} task${d.inserted > 1 ? "s" : ""} found in this email`);
              });
            }
          })
          .catch(() => null);
      }
    },
    [emails, phases, tasks, taskSuggestions, projects]
  );

  const handleApproveTask = useCallback(
    async (suggestion: EmailTaskSuggestion) => {
      try {
        await approveEmailTaskSuggestionAction(suggestion.id, {
          title: suggestion.title,
          priority: suggestion.priority,
          project_id: suggestion.project_id,
          due_date: suggestion.due_hint,
        });
        setTaskSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
        toast.success(`Task added: "${suggestion.title}"`);
      } catch {
        toast.error("Failed to add task");
      }
    },
    []
  );

  const handleDismissTask = useCallback(async (id: string) => {
    try {
      await dismissEmailTaskSuggestionAction(id);
      setTaskSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast.error("Failed to dismiss");
    }
  }, []);

  const handlePhaseAction = useCallback(
    async (phaseId: string | null, _action: string) => {
      if (!phaseId) {
        toast.info("Open the project to update the phase manually.");
        setPhaseSignalDismissed(true);
        return;
      }
      try {
        await updatePhaseStatusAction(phaseId, "complete");
        toast.success("Phase marked complete");
        setPhaseSignalDismissed(true);
      } catch {
        toast.error("Failed to update phase");
      }
    },
    []
  );

  const visibleConflicts = conflictsDismissed ? [] : dateConflicts;
  const visiblePhaseSignal =
    phaseSignalDismissed || !phaseSignal?.detected ? null : phaseSignal;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Email list */}
      <div className="w-72 shrink-0 overflow-hidden flex flex-col">
        <EmailListPanel
          emails={emails}
          selectedThreadId={selectedThreadId}
          taskSuggestions={taskSuggestions}
          projects={projects}
          isSyncing={isSyncing}
          search={search}
          onSearchChange={setSearch}
          onSelectThread={(threadId) => handleSelectThread(threadId)}
          onSync={handleSync}
          onApproveTask={handleApproveTask}
          onDismissTask={handleDismissTask}
        />
      </div>

      {/* Center: Thread view */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        <EmailThreadPanel
          messages={threadMessages}
          dateConflicts={visibleConflicts}
          phaseSignal={visiblePhaseSignal}
          onDismissConflicts={() => setConflictsDismissed(true)}
          onDismissPhaseSignal={() => setPhaseSignalDismissed(true)}
          onPhaseAction={handlePhaseAction}
          onReply={() => setComposeOpen(true)}
        />
      </div>

      {/* Right: AI Compose (conditionally rendered) */}
      {composeOpen && threadMessages.length > 0 && (
        <div className="w-[460px] shrink-0 overflow-hidden flex flex-col">
          <EmailComposePanel
            threadMessages={threadMessages}
            projects={projects}
            phases={phases}
            tasks={tasks}
            hasToneProfile={hasToneProfile}
            onClose={() => setComposeOpen(false)}
            onPhaseSignal={(signal) => {
              setPhaseSignal(signal);
              setPhaseSignalDismissed(false);
            }}
            onMentionedDates={(dates) => {
              const mapped = dates
                .filter((d) => d.iso)
                .map((d) => ({
                  raw: d.raw,
                  date: new Date(d.iso!),
                  context: d.context,
                }));
              if (mapped.length) {
                const newConflicts = checkConflicts(mapped, phases, tasks);
                if (newConflicts.length) {
                  setDateConflicts(newConflicts);
                  setConflictsDismissed(false);
                }
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
