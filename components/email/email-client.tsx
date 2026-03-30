"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { StoredEmail, EmailTaskSuggestion } from "@/lib/db/emails";
import {
  approveEmailTaskSuggestionAction,
  dismissEmailTaskSuggestionAction,
  updatePhaseStatusAction,
} from "@/app/actions";
import { EmailListPanel } from "./email-list-panel";
import { EmailThreadPanel } from "./email-thread-panel";
import { NewEmailModal } from "./new-email-modal";

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

export interface MentionedDate {
  raw: string;
  iso: string | null;
  context: string;
}

interface EmailClientProps {
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

/**
 * Words that signal a date is being used in a scheduling/availability context.
 * If none of these appear near the date, it's likely a reference date (invoice
 * date, link expiry, etc.) rather than a proposed shoot/meeting time.
 */
const SCHEDULING_KEYWORDS = [
  "available", "availability", "free", "busy", "hold",
  "shoot", "filming", "film", "record", "production", "on set", "set day",
  "book", "booking", "schedule", "scheduled", "reschedule",
  "meeting", "call", "sync", "check-in",
  "deadline", "deliver", "delivery", "due",
  "arrive", "arrival", "fly", "travel", "location",
  "confirm", "confirmation", "tentative", "prelim",
  "can we", "are you", "is that", "would you", "could you",
  "works for you", "work for you", "good for you",
  "looking at", "eyeing", "targeting", "hoping for",
];

/**
 * Public US holidays that should NEVER be flagged as scheduling conflicts.
 * Format: MM-DD (month and day only, year-agnostic).
 */
const US_HOLIDAYS = new Set([
  "01-01", // New Year's Day
  "07-04", // Independence Day
  "11-11", // Veterans Day
  "12-25", // Christmas
  "12-24", // Christmas Eve
  "12-31", // New Year's Eve
  "11-28", "11-29", // Thanksgiving (approx — Thu + Fri)
  "05-26", "05-25", "05-27", // Memorial Day weekend (approx)
  "09-01", "09-02", // Labor Day (approx)
]);

function isPublicHoliday(date: Date): boolean {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return US_HOLIDAYS.has(`${mm}-${dd}`);
}

/** Returns true if the surrounding text suggests the date is scheduling-related */
function hasSchedulingContext(context: string): boolean {
  const lower = context.toLowerCase();
  return SCHEDULING_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Client-side date extraction (regex-based, instant) */
function extractDatesFromText(
  text: string
): Array<{ raw: string; date: Date; context: string }> {
  const results: Array<{ raw: string; date: Date; context: string }> = [];
  const now = new Date();
  const seen = new Set<string>();

  const re1 =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/gi;
  let match: RegExpExecArray | null;

  while ((match = re1.exec(text)) !== null) {
    const year = match[3] ? parseInt(match[3]) : now.getFullYear();
    const date = new Date(`${match[1]} ${match[2]}, ${year}`);
    const key = date.toISOString().split("T")[0];
    if (!isNaN(date.getTime()) && !seen.has(key)) {
      seen.add(key);
      results.push({
        raw: match[0],
        date,
        context: text.slice(Math.max(0, match.index - 60), match.index + 80),
      });
    }
  }

  const re2 = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((match = re2.exec(text)) !== null) {
    const date = new Date(match[0]);
    const key = date.toISOString().split("T")[0];
    if (!isNaN(date.getTime()) && !seen.has(key)) {
      seen.add(key);
      results.push({
        raw: match[0],
        date,
        context: text.slice(Math.max(0, match.index - 60), match.index + 80),
      });
    }
  }

  const re3 = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
  while ((match = re3.exec(text)) !== null) {
    const yr =
      match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3]);
    const date = new Date(yr, parseInt(match[1]) - 1, parseInt(match[2]));
    const key = date.toISOString().split("T")[0];
    if (!isNaN(date.getTime()) && !seen.has(key)) {
      seen.add(key);
      results.push({
        raw: match[0],
        date,
        context: text.slice(Math.max(0, match.index - 60), match.index + 80),
      });
    }
  }

  return results;
}

/**
 * Only flag conflicts when:
 * 1. The date appears in a scheduling context (not just any date mention)
 * 2. It's not a recognized public holiday
 * 3. It overlaps with an ACTIVE project phase (not just a task due date)
 *
 * A date conflict means: someone is proposing to schedule something on a day
 * you already have an active production phase committed.
 */
function checkConflicts(
  extractedDates: Array<{ raw: string; date: Date; context: string }>,
  phases: Phase[]
): DateConflict[] {
  const conflicts: DateConflict[] = [];
  const activeStatuses = new Set(["active", "in_progress", "in-progress"]);

  // Only consider dates that appear in a scheduling context
  const schedulingDates = extractedDates.filter(
    (d) => hasSchedulingContext(d.context) && !isPublicHoliday(d.date)
  );

  for (const { raw, date, context } of schedulingDates) {
    for (const phase of phases) {
      if (!phase.start_date) continue;
      if (!activeStatuses.has(phase.status)) continue;
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
  }

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
  initialFilterAddresses,
  calendarConnected,
  userEmail,
}: EmailClientProps) {
  const [emails, setEmails] = useState(initialEmails);
  const [taskSuggestions, setTaskSuggestions] = useState(initialTaskSuggestions);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<"inbox" | "sent">("inbox");
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");
  const [newEmailOpen, setNewEmailOpen] = useState(false);
  const assistantActionApplied = useRef(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [dateConflicts, setDateConflicts] = useState<DateConflict[]>([]);
  const [mentionedDates, setMentionedDates] = useState<MentionedDate[]>([]);
  const [phaseSignal, setPhaseSignal] = useState<PhaseSignal | null>(null);
  const [conflictsDismissed, setConflictsDismissed] = useState(false);
  const [phaseSignalDismissed, setPhaseSignalDismissed] = useState(false);
  const [filterAddresses] = useState<string[]>(initialFilterAddresses);

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
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Sync failed");
      }
      const data = (await res.json()) as {
        synced: number;
        emails?: StoredEmail[];
        taskSuggestions?: EmailTaskSuggestion[];
        syncErrors?: Array<{ type: string; id?: string; error: string }>;
      };

      if (data.emails) setEmails(data.emails);
      if (data.taskSuggestions) setTaskSuggestions(data.taskSuggestions);
      if (data.syncErrors?.length) {
        console.warn("Email sync partial errors:", data.syncErrors);
      }

      if (!silent) {
        if (data.syncErrors?.length) {
          toast.warning(
            data.synced > 0
              ? `${data.synced} new email${data.synced !== 1 ? "s" : ""}, but some messages failed to sync`
              : "Inbox refreshed, but some messages failed to sync"
          );
        } else if (data.synced > 0) {
          toast.success(`${data.synced} new email${data.synced !== 1 ? "s" : ""}`);
        } else {
          toast.info("Inbox is up to date");
        }
      } else if (data.synced > 0) {
        toast.success(`${data.synced} new email${data.synced !== 1 ? "s" : ""}`, {
          id: "bg-sync",
        });
      }
    } catch (err) {
      if (!silent) {
        const msg = err instanceof Error ? err.message : "Sync failed";
        toast.error(
          msg.includes("Not connected") ? "Gmail not connected" : "Sync failed — try again"
        );
      }
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    const key = "prdcr-email-last-sync";
    const last = sessionStorage.getItem(key);
    const now = Date.now();
    if (!last || now - parseInt(last) > 10_000) {
      sessionStorage.setItem(key, String(now));
      handleSync(true);
    }
  }, [handleSync]);

  useEffect(() => {
    const syncIfVisible = () => {
      if (!document.hidden) handleSync(true);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) syncIfVisible();
    };

    window.addEventListener("focus", syncIfVisible);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const interval = setInterval(() => {
      syncIfVisible();
    }, 30_000);

    return () => {
      window.removeEventListener("focus", syncIfVisible);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
    };
  }, [handleSync]);

  // ── Scheduled send polling ── check every 60s for due emails, send them
  useEffect(() => {
    const checkScheduled = async () => {
      try {
        const res = await fetch("/api/email/send-scheduled", { method: "POST" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.sent > 0) {
          toast.success(
            `${data.sent} scheduled email${data.sent !== 1 ? "s" : ""} sent`
          );
        }
      } catch {
        // silent — don't disrupt the user
      }
    };
    checkScheduled();
    const interval = setInterval(checkScheduled, 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectThread = useCallback(
    (threadId: string) => {
      setSelectedThreadId(threadId);
      setMobileView("thread");
      setConflictsDismissed(false);
      setPhaseSignalDismissed(false);
      setPhaseSignal(null);
      setDateConflicts([]);
      setMentionedDates([]);

      const threadEmails = emails
        .filter((e) => e.gmail_thread_id === threadId)
        .sort(
          (a, b) =>
            new Date(a.received_at ?? 0).getTime() -
            new Date(b.received_at ?? 0).getTime()
        );

      const allText = threadEmails.map((e) => e.body_text ?? e.snippet ?? "").join(" ");
      const extracted = extractDatesFromText(allText);

      if (extracted.length > 0) {
        setMentionedDates(
          extracted.map((d) => ({
            raw: d.raw,
            iso: d.date.toISOString().split("T")[0],
            context: d.context,
          }))
        );
        // Only check phase conflicts (not tasks)
        const conflicts = checkConflicts(extracted, phases);
        if (conflicts.length > 0) setDateConflicts(conflicts);
      }

      // On-demand task extraction for emails from allowlisted senders
      const latestEmail = threadEmails[threadEmails.length - 1];
      if (
        latestEmail &&
        !latestEmail.is_sent &&
        filterAddresses.length > 0 &&
        filterAddresses.some(
          (addr) => addr.toLowerCase() === latestEmail.from_email?.toLowerCase()
        ) &&
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
          .then((d: { inserted?: number }) => {
            if ((d.inserted ?? 0) > 0) {
              toast.info(
                `${d.inserted} task${(d.inserted ?? 0) > 1 ? "s" : ""} found in this email`
              );
            }
          })
          .catch(() => null);
      }
    },
    [emails, phases, taskSuggestions, projects, filterAddresses]
  );

  // Handle assistant action from sessionStorage
  useEffect(() => {
    if (assistantActionApplied.current || emails.length === 0) return;

    const stored = sessionStorage.getItem("prdcr_assistant_email");
    if (!stored) return;

    assistantActionApplied.current = true;
    sessionStorage.removeItem("prdcr_assistant_email");

    try {
      const assistantAction = JSON.parse(stored) as {
        type: string;
        thread_id?: string;
        sender_name?: string;
        to?: string;
      };

      if (assistantAction.type === "reply" && assistantAction.thread_id) {
        const threadExists = emails.some((e) => e.gmail_thread_id === assistantAction.thread_id);
        if (threadExists) {
          handleSelectThread(assistantAction.thread_id);
        } else {
          toast.info("Thread not found — it may need to sync first");
        }
      } else if (assistantAction.type === "reply" && assistantAction.sender_name) {
        const match = emails.find(
          (e) =>
            !e.is_sent &&
            e.from_name
              ?.toLowerCase()
              .includes((assistantAction.sender_name ?? "").toLowerCase())
        );
        if (match?.gmail_thread_id) {
          handleSelectThread(match.gmail_thread_id);
        } else {
          toast.info(
            `Find the email from ${assistantAction.sender_name} in your inbox to reply`
          );
        }
      } else if (assistantAction.type === "compose") {
        setNewEmailOpen(true);
      }
    } catch {
      // malformed storage — ignore
    }
  }, [emails, handleSelectThread]);

  const handleApproveTask = useCallback(async (suggestion: EmailTaskSuggestion) => {
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
  }, []);

  const handleDismissTask = useCallback(async (id: string) => {
    try {
      await dismissEmailTaskSuggestionAction(id);
      setTaskSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast.error("Failed to dismiss");
    }
  }, []);

  const handlePhaseAction = useCallback(
    async (phaseId: string | null, action: string) => {
      void action;
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

  const handleCreateCalendarEvent = useCallback(
    async (params: { summary: string; date: string }) => {
      try {
        const res = await fetch("/api/calendar/create-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: params.summary,
            allDay: true,
            startDate: params.date,
            endDate: params.date,
          }),
        });
        const data = (await res.json()) as {
          success?: boolean;
          htmlLink?: string;
          error?: string;
        };
        if (!res.ok || data.error) throw new Error(data.error ?? "Failed to create event");
        toast.success("Event added to Google Calendar", {
          action: data.htmlLink
            ? {
                label: "View",
                onClick: () => window.open(data.htmlLink, "_blank"),
              }
            : undefined,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create event");
      }
    },
    []
  );

  const visibleConflicts = conflictsDismissed ? [] : dateConflicts;
  const visiblePhaseSignal =
    phaseSignalDismissed || !phaseSignal?.detected ? null : phaseSignal;

  return (
    <>
      <div className="flex h-full overflow-hidden">
        {/* ── Email list panel ──
            Full-width by default; shrinks to sidebar when a thread is selected.
            Hidden on mobile when viewing a thread. */}
        <div
          className={cn(
            "overflow-hidden flex flex-col transition-all duration-200",
            mobileView === "thread" && "hidden md:flex",
            selectedThreadId
              ? "md:w-80 lg:w-96 shrink-0 border-r border-border"
              : "flex-1"
          )}
        >
          <EmailListPanel
              emails={emails}
              selectedThreadId={selectedThreadId}
              taskSuggestions={taskSuggestions}
              projects={projects}
              isSyncing={isSyncing}
              search={search}
              activeFolder={activeFolder}
              onFolderChange={(folder) => {
                setActiveFolder(folder);
                setSelectedThreadId(null);
              }}
              onSearchChange={setSearch}
              onSelectThread={handleSelectThread}
              onSync={handleSync}
              onApproveTask={handleApproveTask}
              onDismissTask={handleDismissTask}
              onCompose={() => setNewEmailOpen(true)}
            />
        </div>

        {/* ── Thread view ── */}
        {selectedThreadId && (
          <div
            className={cn(
              "flex-1 min-w-0 overflow-hidden flex-col",
              mobileView === "thread" ? "flex" : "hidden md:flex"
            )}
          >
            {/* Back button (mobile + desktop when list is hidden) */}
            <div className="flex items-center gap-2 px-4 h-11 border-b border-border shrink-0 bg-background/80 backdrop-blur-sm md:hidden">
              <button
                onClick={() => {
                  setSelectedThreadId(null);
                  setMobileView("list");
                }}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                {activeFolder === "sent" ? "Sent" : "Inbox"}
              </button>
            </div>

            <EmailThreadPanel
              messages={threadMessages}
              dateConflicts={visibleConflicts}
              mentionedDates={mentionedDates}
              phaseSignal={visiblePhaseSignal}
              calendarConnected={calendarConnected}
              projects={projects}
              phases={phases}
              tasks={tasks}
              hasToneProfile={hasToneProfile}
              userEmail={userEmail}
              onDismissConflicts={() => setConflictsDismissed(true)}
              onDismissPhaseSignal={() => setPhaseSignalDismissed(true)}
              onPhaseAction={handlePhaseAction}
              onCreateCalendarEvent={handleCreateCalendarEvent}
              onPhaseSignal={(signal) => {
                setPhaseSignal(signal);
                setPhaseSignalDismissed(false);
              }}
            />
          </div>
        )}
      </div>

      {/* ── New email modal ── */}
      {newEmailOpen && (
        <NewEmailModal
          projects={projects}
          phases={phases}
          tasks={tasks}
          hasToneProfile={hasToneProfile}
          userEmail={userEmail}
          onClose={() => setNewEmailOpen(false)}
          onSent={() => {
            setNewEmailOpen(false);
            handleSync(true);
          }}
        />
      )}
    </>
  );
}
