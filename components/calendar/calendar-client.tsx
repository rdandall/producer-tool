"use client";

import { useState, useEffect, useCallback, useMemo, useTransition, useRef, type FormEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Loader2,
  ExternalLink,
  Unlink,
  X,
  Plus,
  ArrowRight,
  Printer,
  HelpCircle,
  LayoutGrid,
  List,
  Mic,
  MicOff,
  AlertTriangle,
  Layers,
  MousePointerClick,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createTaskAction } from "@/app/actions";
import type { GoogleCalendarEvent, GoogleCalendar } from "@/lib/google-calendar";
import type { PrdcrEvent } from "@/app/api/calendar/events/route";
import type { Phase } from "@/lib/db/projects";
import { useLiveDictation } from "@/hooks/use-live-dictation";

// ── Constants ────────────────────────────────────────────────────────
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const PRIORITY_OPTS = ["high", "medium", "low"] as const;
const fieldClass =
  "w-full text-sm bg-background border border-border px-3 py-2 text-foreground " +
  "placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors";

// ── Types ────────────────────────────────────────────────────────────
interface DayEvent {
  id: string;
  summary: string;
  color: string;
  type: "google" | "project" | "task";
  href?: string;
  timeLabel?: string;
  calendarName?: string;
  priority?: string | null;
  start: string;
}

interface CalendarData {
  googleEvents: GoogleCalendarEvent[];
  googleCalendars: GoogleCalendar[];
  projectDeadlines: PrdcrEvent[];
  taskDeadlines: PrdcrEvent[];
  availableProjects: { id: string; title: string; color: string }[];
  projectPhases: Record<string, Phase[]>;
  connected: boolean;
  error?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getEventDate(iso: string) { return iso.substring(0, 10); }
function formatTime(iso: string): string | undefined {
  if (iso.length === 10) return undefined;
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function buildGridDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: (Date | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(year, month, d));
  while (grid.length % 7 !== 0) grid.push(null);
  return grid;
}
function fmtDateShort(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDateFull(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// ── Main Component ───────────────────────────────────────────────────
export function CalendarClient() {
  const today = new Date();
  const todayStr = toDateStr(today);

  // ── View + navigation state ──────────────────────────────────────
  const [year, setYear]     = useState(today.getFullYear());
  const [month, setMonth]   = useState(today.getMonth());
  const [selected, setSelected] = useState<string>(todayStr);
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [panelMode, setPanelMode] = useState<"day" | "agenda">("day");

  // ── Data state ───────────────────────────────────────────────────
  const [data, setData]     = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Disconnect state ─────────────────────────────────────────────
  const [disconnecting, setDisconnecting]       = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // ── Quick-add / convert task state ──────────────────────────────
  const [quickAddDate, setQuickAddDate]   = useState<string | null>(null);
  const [convertEvent, setConvertEvent]   = useState<DayEvent | null>(null);
  const [taskFormError, setTaskFormError] = useState("");
  const [isCreatingTask, startTaskTransition] = useTransition();

  // ── Add-event dialog state ───────────────────────────────────────
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventNotes, setEventNotes] = useState("");
  const [eventAllDay, setEventAllDay] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const eventTitleRef = useRef<HTMLInputElement>(null);
  const {
    cancelDictation: cancelEventNotesDictation,
    isFinalizing: isEventNotesFinalizing,
    isLiveFormatting: isEventNotesFormatting,
    isRecording: isEventNotesRecording,
    toggleDictation: toggleEventNotesDictation,
  } = useLiveDictation({
    value: eventNotes,
    onChange: setEventNotes,
    contextType: "calendar-notes",
    minLiveIntervalMs: 850,
  });

  // ── Conflict detection state ─────────────────────────────────────
  const [dismissedConflicts, setDismissedConflicts] = useState<Set<string>>(new Set());

  // ── Phase expansion state ────────────────────────────────────────
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  // ── Feature guide state ──────────────────────────────────────────
  const [showFeatures, setShowFeatures] = useState(false);

  const closeEventDialog = useCallback(() => {
    cancelEventNotesDictation();
    setEventDialogOpen(false);
  }, [cancelEventNotesDictation]);

  // Strip ?connected=true from URL after OAuth redirect
  // Also read assistant-provided event params (title, date, time, notes)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("connected") === "true") {
      window.history.replaceState({}, "", "/dashboard/calendar");
    }
    const assistantTitle = p.get("title");
    const assistantDate  = p.get("date");
    const assistantTime  = p.get("time");
    const assistantLocation = p.get("location");
    const assistantNotes = p.get("notes");
    const assistantDuration = p.get("duration");
    if (assistantTitle || assistantDate) {
      setEventTitle(assistantTitle ?? "");
      setEventDate(assistantDate ?? todayStr);
      setEventTime(assistantTime ?? "");
      setEventLocation(assistantLocation ?? "");
      setEventNotes(assistantNotes ?? "");
      // Auto-calculate end time from duration (e.g. "1 hour", "30 minutes")
      if (assistantTime && assistantDuration) {
        const match = assistantDuration.match(/(\d+(?:\.\d+)?)\s*(hour|minute|min|hr)/i);
        if (match) {
          const amount = parseFloat(match[1]);
          const unit = match[2].toLowerCase();
          const mins = unit.startsWith("h") ? amount * 60 : amount;
          const [h, m] = assistantTime.split(":").map(Number);
          const totalMins = h * 60 + (m || 0) + mins;
          const endH = Math.floor(totalMins / 60) % 24;
          const endM = Math.round(totalMins % 60);
          setEventEndTime(`${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`);
        }
      }
      setEventDialogOpen(true);
      // Clean URL params
      window.history.replaceState({}, "", "/dashboard/calendar");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape key closes features panel or task dialog
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showFeatures) { setShowFeatures(false); return; }
        if (eventDialogOpen) { closeEventDialog(); return; }
        if (quickAddDate || convertEvent) { setQuickAddDate(null); setConvertEvent(null); setTaskFormError(""); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeEventDialog, convertEvent, eventDialogOpen, quickAddDate, showFeatures]);

  // ── Fetch events ─────────────────────────────────────────────────
  const fetchEvents = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar/events?year=${y}&month=${m}`);
      if (res.ok) setData(await res.json());
    } catch (e) {
      console.error("Calendar fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEvents(year, month); }, [year, month, fetchEvents]);

  // Auto-sync month/year when week view crosses a month boundary
  useEffect(() => {
    if (viewMode === "week") {
      const d = new Date(selected + "T12:00:00");
      if (d.getFullYear() !== year || d.getMonth() !== month) {
        setYear(d.getFullYear());
        setMonth(d.getMonth());
      }
    }
  }, [selected, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ───────────────────────────────────────────────────
  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }
  function goToday() {
    setYear(today.getFullYear()); setMonth(today.getMonth());
    setSelected(todayStr);
  }
  function prevWeek() {
    const d = new Date(selected + "T12:00:00"); d.setDate(d.getDate() - 7);
    setSelected(toDateStr(d));
  }
  function nextWeek() {
    const d = new Date(selected + "T12:00:00"); d.setDate(d.getDate() + 7);
    setSelected(toDateStr(d));
  }

  function selectDay(dateStr: string) {
    setSelected(dateStr);
    setPanelMode("day");
  }

  // ── Disconnect ───────────────────────────────────────────────────
  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/auth/google/disconnect", { method: "POST" });
      setConfirmDisconnect(false);
      await fetchEvents(year, month);
    } finally {
      setDisconnecting(false);
    }
  }

  // ── Create task ──────────────────────────────────────────────────
  async function handleCreateTask(e: FormEvent) {
    e.preventDefault();
    setTaskFormError("");
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    startTaskTransition(async () => {
      try {
        await createTaskAction(fd);
        setQuickAddDate(null);
        setConvertEvent(null);
        toast.success("Task created");
        await fetchEvents(year, month);
      } catch (err) {
        setTaskFormError(err instanceof Error ? err.message : "Failed to create task");
      }
    });
  }

  function openEventDialog(dateStr: string) {
    cancelEventNotesDictation();
    setEventTitle("");
    setEventDate(dateStr);
    setEventTime("09:00");
    setEventEndTime("10:00");
    setEventLocation("");
    setEventNotes("");
    setEventAllDay(false);
    setEventDialogOpen(true);
    setTimeout(() => eventTitleRef.current?.focus(), 50);
  }

  // ── Create Google Calendar event ─────────────────────────────────
  async function handleCreateEvent(e: FormEvent) {
    e.preventDefault();
    if (!eventTitle.trim()) return;
    setIsCreatingEvent(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let body: Record<string, unknown>;
      if (eventAllDay) {
        body = { summary: eventTitle.trim(), description: eventNotes || undefined, location: eventLocation || undefined, allDay: true, startDate: eventDate, endDate: eventDate };
      } else {
        const startDT = `${eventDate}T${eventTime || "09:00"}:00`;
        const endDT   = `${eventDate}T${eventEndTime || eventTime || "10:00"}:00`;
        body = { summary: eventTitle.trim(), description: eventNotes || undefined, location: eventLocation || undefined, startDateTime: startDT, endDateTime: endDT, timeZone: tz };
      }
      const res = await fetch("/api/calendar/create-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        // 401 most likely means the stored token lacks calendar write scope —
        // the user connected before we added calendar.events permission.
        if (res.status === 401 || (data.error ?? "").toLowerCase().includes("unauthorized") || (data.error ?? "").toLowerCase().includes("insufficient")) {
          toast.error("Calendar write access required — disconnect and reconnect Google Calendar to grant permission.", { duration: 8000 });
        } else {
          throw new Error(data.error ?? "Failed to create event");
        }
        return;
      }
      toast.success("Event added to Google Calendar");
      closeEventDialog();
      await fetchEvents(year, month);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setIsCreatingEvent(false);
    }
  }

  // ── Build event map ──────────────────────────────────────────────
  const eventsByDate = useMemo<Record<string, DayEvent[]>>(() => {
    const map: Record<string, DayEvent[]> = {};
    if (!data) return map;
    for (const ev of data.googleEvents) {
      const d = getEventDate(ev.start);
      map[d] ??= [];
      map[d].push({ id: ev.id, summary: ev.summary, color: ev.calendarColor, type: "google", timeLabel: formatTime(ev.start), calendarName: ev.calendarName, start: ev.start });
    }
    for (const ev of data.projectDeadlines) {
      const d = getEventDate(ev.start);
      map[d] ??= [];
      map[d].push({ id: ev.id, summary: ev.summary, color: ev.color, type: "project", href: ev.href, start: ev.start });
    }
    for (const ev of data.taskDeadlines) {
      const d = getEventDate(ev.start);
      map[d] ??= [];
      map[d].push({ id: ev.id, summary: ev.summary, color: ev.color, type: "task", priority: ev.priority, start: ev.start });
    }
    return map;
  }, [data]);

  // ── Week view data ───────────────────────────────────────────────
  const weekStart = useMemo(() => {
    const d = new Date(selected + "T12:00:00");
    d.setDate(d.getDate() - d.getDay());
    return d;
  }, [selected]);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
    }), [weekStart]);

  // ── Grid days (month view) ───────────────────────────────────────
  const gridDays = useMemo(() => buildGridDays(year, month), [year, month]);

  // ── Selected day events ──────────────────────────────────────────
  const selectedEvents = eventsByDate[selected] ?? [];

  // ── Agenda days (next 14 days from today that have events) ───────
  const agendaDays = useMemo(() => {
    const days: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const s = toDateStr(d);
      if (eventsByDate[s]?.length) days.push(s);
    }
    return days;
  }, [eventsByDate]);

  // ── Print schedule dates (all days with events in viewed month) ──
  const printScheduleDates = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    return Object.keys(eventsByDate)
      .filter(d => d.startsWith(prefix) && eventsByDate[d].length > 0)
      .sort();
  }, [eventsByDate, year, month]);

  // ── Conflict detection ───────────────────────────────────────────
  const conflictWeeks = useMemo(() => {
    const weekMap: Record<string, PrdcrEvent[]> = {};
    for (const ev of data?.projectDeadlines ?? []) {
      const d = new Date(ev.start + "T12:00:00");
      const sun = new Date(d); sun.setDate(d.getDate() - d.getDay());
      const key = toDateStr(sun);
      weekMap[key] ??= []; weekMap[key].push(ev);
    }
    return Object.entries(weekMap)
      .filter(([, evs]) => evs.length >= 2)
      .map(([ws, evs]) => {
        const sat = new Date(ws + "T12:00:00"); sat.setDate(sat.getDate() + 6);
        return { weekStart: ws, weekEnd: toDateStr(sat), events: evs };
      });
  }, [data?.projectDeadlines]);

  // ── Selected date label ──────────────────────────────────────────
  const selectedLabel = (() => {
    if (selected === todayStr) return "Today";
    const d = new Date(selected + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  })();

  // ── Legend data ──────────────────────────────────────────────────
  const calendarIdsWithEvents = data?.connected
    ? new Set(data.googleEvents.map((ev) => ev.calendarId)) : new Set<string>();
  const activeGoogleCalendars = (data?.googleCalendars ?? []).filter(c => calendarIdsWithEvents.has(c.id));
  const projectsInView = (() => {
    const seen = new Map<string, { name: string; color: string }>();
    for (const ev of data?.projectDeadlines ?? []) {
      if (!seen.has(ev.color)) seen.set(ev.color, { name: ev.summary.replace(/ deadline$/, ""), color: ev.color });
    }
    return [...seen.values()];
  })();
  const hasTasksInView = (data?.taskDeadlines ?? []).length > 0;

  // ── Task dialog state ────────────────────────────────────────────
  const taskDialogOpen = quickAddDate !== null || convertEvent !== null;
  const taskDialogDate = quickAddDate ?? (convertEvent ? getEventDate(convertEvent.start) : "");
  const taskDialogTitle = convertEvent?.summary ?? "";

  // ── Reusable event card ──────────────────────────────────────────
  function EventCard({ ev, showPhases = true }: { ev: DayEvent; showPhases?: boolean }) {
    const projId = ev.type === "project" ? ev.id.replace("project-", "") : "";
    const phases = projId && data?.projectPhases[projId] ? data.projectPhases[projId] : [];
    const isExpanded = expandedProjectId === projId;

    return (
      <div
        className="px-3 py-2.5 rounded-sm"
        style={{ borderLeft: `2.5px solid ${ev.color}`, backgroundColor: `${ev.color}0a` }}
      >
        {ev.href ? (
          <Link href={ev.href} className="flex items-start gap-1.5 group">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
                {ev.summary}
              </p>
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                {ev.type === "project" ? "Project deadline" : "Task due"}
                {ev.timeLabel && <> · {ev.timeLabel}</>}
              </p>
            </div>
            <ExternalLink className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground/25 group-hover:text-primary/50 transition-colors" />
          </Link>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-1">
              <p className="text-sm font-semibold text-foreground leading-snug flex-1 min-w-0">{ev.summary}</p>
              {ev.type === "google" && (
                <button
                  onClick={() => setConvertEvent(ev)}
                  title="Create task from this event"
                  className="shrink-0 flex items-center gap-0.5 text-[9px] text-muted-foreground/40 hover:text-foreground transition-colors mt-0.5"
                >
                  <ArrowRight className="w-2.5 h-2.5" />Task
                </button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">
              {ev.type === "google"
                ? ev.calendarName ?? "Google Calendar"
                : ev.type === "task"
                  ? `Task due${ev.priority ? ` · ${ev.priority}` : ""}`
                  : "Deadline"}
              {ev.timeLabel && <> · {ev.timeLabel}</>}
            </p>
          </div>
        )}

        {/* Mini phase timeline */}
        {showPhases && ev.type === "project" && phases.length > 0 && (
          <div className="mt-1.5">
            <button
              onClick={() => setExpandedProjectId(isExpanded ? null : projId)}
              className="text-[9px] text-muted-foreground/35 hover:text-muted-foreground transition-colors"
            >
              {isExpanded ? "▲ Hide phases" : `▼ ${phases.length} phases`}
            </button>
            {isExpanded && (
              <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                {[...phases].sort((a, b) => a.start_date.localeCompare(b.start_date)).map(ph => (
                  <div
                    key={ph.id}
                    className={cn(
                      "shrink-0 px-2 py-1 text-[9px] font-medium border rounded-sm",
                      ph.status === "complete" ? "opacity-40 border-border/30" :
                        ph.status === "active" ? "border-primary/50 bg-primary/5" : "border-border/40"
                    )}
                  >
                    <div className="font-semibold">{ph.name}</div>
                    <div className="text-muted-foreground/50">
                      {fmtDateShort(ph.start_date)}{ph.end_date ? ` → ${fmtDateShort(ph.end_date)}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          [data-sidebar], .no-print { display: none !important; }
          [data-calendar-main] { display: none !important; }
          .print-schedule { display: block !important; }
          @page { margin: 2cm 2.5cm; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .print-schedule { display: none; }
      `}</style>

      <div className="flex-1 overflow-auto" data-calendar-main>
        <div className="max-w-7xl mx-auto px-8 py-8">

          {/* ── Page header ──────────────────────────────────── */}
          <div className="flex items-start justify-between mb-8 no-print">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground">Calendar</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Shoot days, deadlines, and project milestones
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* New Event button (only when Google Calendar connected) */}
              {data?.connected && (
                <button
                  onClick={() => openEventDialog(selected)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-foreground text-background hover:bg-foreground/85 transition-colors"
                >
                  <Plus className="w-3 h-3" /> New Event
                </button>
              )}

              {/* Print button */}
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border/50 hover:border-foreground/30 hover:text-foreground transition-colors"
              >
                <Printer className="w-3 h-3" /> Print
              </button>

              {/* Features guide — low profile */}
              <button
                onClick={() => setShowFeatures(true)}
                title="What can I do here?"
                className="w-7 h-7 flex items-center justify-center text-muted-foreground/30 hover:text-muted-foreground transition-colors"
              >
                <HelpCircle className="w-4 h-4" />
              </button>

              {/* Google Calendar connect / disconnect */}
              {data && !data.connected && (
                <a
                  href="/api/auth/google"
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-foreground text-background hover:bg-foreground/85 transition-colors"
                >
                  <CalendarDays className="w-4 h-4" />
                  Connect Google Calendar
                </a>
              )}

              {data?.connected && !confirmDisconnect && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Google Calendar synced
                  </div>
                  <button
                    onClick={() => setConfirmDisconnect(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border/50 hover:border-destructive/50 hover:text-destructive transition-colors"
                  >
                    <Unlink className="w-3 h-3" /> Disconnect
                  </button>
                </div>
              )}

              {confirmDisconnect && (
                <div className="flex items-center gap-2 px-3 py-1.5 border border-destructive/30 bg-destructive/5">
                  <span className="text-xs text-foreground/70">Disconnect Google Calendar?</span>
                  <button onClick={() => setConfirmDisconnect(false)} className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground border border-border/40 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold text-destructive border border-destructive/40 hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50"
                  >
                    {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                    Yes, disconnect
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Main layout ──────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5" data-calendar-grid>

            {/* ── Calendar panel ─────────────────────────────── */}
            <div className="border border-border overflow-hidden">

              {/* Month/week nav bar */}
              <div className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 border-b border-border no-print">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <h2 className="text-sm sm:text-base font-bold tracking-tight truncate">
                    {viewMode === "month"
                      ? <>{MONTH_NAMES[month]} <span className="text-muted-foreground/50 font-normal">{year}</span></>
                      : <>{fmtDateShort(toDateStr(weekDays[0]))} – {fmtDateShort(toDateStr(weekDays[6]))}, <span className="text-muted-foreground/50 font-normal">{weekDays[6].getFullYear()}</span></>
                    }
                  </h2>
                  {/* Month | Week toggle */}
                  <div className="flex border border-border overflow-hidden">
                    {(["month", "week"] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => setViewMode(v)}
                        className={cn(
                          "px-2.5 h-7 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                          viewMode === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                        )}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-0.5">
                  <button
                    onClick={viewMode === "month" ? prevMonth : prevWeek}
                    className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                    aria-label="Previous"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={goToday}
                    className="px-3 h-8 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                  >
                    Today
                  </button>
                  <button
                    onClick={viewMode === "month" ? nextMonth : nextWeek}
                    className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                    aria-label="Next"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Conflict detection banners */}
              {conflictWeeks
                .filter(c => !dismissedConflicts.has(c.weekStart))
                .map(c => (
                  <div key={c.weekStart} className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 no-print">
                    <span>⚠ {c.events.length} deliverables due the same week ({fmtDateShort(c.weekStart)}–{fmtDateShort(c.weekEnd)})</span>
                    <button
                      onClick={() => setDismissedConflicts(s => new Set([...s, c.weekStart]))}
                      className="ml-auto shrink-0 opacity-60 hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 border-b border-border bg-accent/5">
                {DAYS_SHORT.map((d) => (
                  <div key={d} className="py-2.5 text-center">
                    <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground/40">{d}</span>
                  </div>
                ))}
              </div>

              {/* Day cells */}
              {loading ? (
                <div className="flex items-center justify-center py-32">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/30" />
                </div>
              ) : viewMode === "month" ? (
                /* ── Month view ── */
                <div className="grid grid-cols-7">
                  {gridDays.map((day, i) => {
                    const isLastCol = i % 7 === 6;
                    const isLastRow = i >= gridDays.length - 7;

                    if (!day) {
                      return (
                        <div key={`empty-${i}`} className={cn("min-h-[80px] sm:min-h-[130px] bg-accent/[0.03]", !isLastCol && "border-r border-border/30", !isLastRow && "border-b border-border/30")} />
                      );
                    }

                    const dateStr = toDateStr(day);
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selected;
                    const dayEvents = eventsByDate[dateStr] ?? [];
                    const visible = dayEvents.slice(0, 3);
                    const overflow = dayEvents.length - visible.length;
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                    return (
                      <button
                        key={dateStr}
                        onClick={() => selectDay(dateStr)}
                        className={cn(
                          "min-h-[80px] sm:min-h-[130px] p-1 sm:p-2 text-left transition-colors focus:outline-none group relative",
                          !isLastCol && "border-r border-border/30",
                          !isLastRow && "border-b border-border/30",
                          isWeekend && !isSelected && "bg-accent/[0.04]",
                          isSelected ? "bg-accent/20 ring-1 ring-inset ring-border/50" : "hover:bg-accent/10"
                        )}
                      >
                        {/* Quick-add button */}
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <button
                            onClick={(e) => { e.stopPropagation(); setQuickAddDate(dateStr); }}
                            title="Add task"
                            className="w-5 h-5 flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-foreground/10 rounded-sm transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Date number */}
                        <div className="mb-1.5 flex items-start justify-between">
                          <span className={cn(
                            "inline-flex w-7 h-7 items-center justify-center text-[11px] font-bold",
                            isToday ? "bg-foreground text-background rounded-full" :
                              isSelected ? "text-foreground" :
                                isWeekend ? "text-muted-foreground/35" : "text-muted-foreground/55"
                          )}>
                            {day.getDate()}
                          </span>
                          {dayEvents.length > 0 && !isSelected && (
                            <span className="text-[9px] text-muted-foreground/20 font-medium tabular-nums mt-1 group-hover:text-muted-foreground/40 transition-colors">
                              {dayEvents.length}
                            </span>
                          )}
                        </div>

                        {/* Event chips */}
                        <div className="space-y-0.5">
                          {visible.map((ev) => (
                            <div key={ev.id} className="flex items-center gap-1.5 px-1.5 py-[3px] rounded-[3px]" style={{ backgroundColor: `${ev.color}15` }}>
                              <div className="w-[5px] h-[5px] rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
                              <span className="text-[10px] font-medium truncate leading-none" style={{ color: ev.color }}>
                                {ev.timeLabel ? `${ev.timeLabel} · ` : ""}{ev.summary}
                              </span>
                            </div>
                          ))}
                          {overflow > 0 && (
                            <span className="text-[10px] text-muted-foreground/35 pl-1.5 font-medium">+{overflow} more</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* ── Week view ── */
                <div className="grid grid-cols-7">
                  {weekDays.map((day) => {
                    const dateStr = toDateStr(day);
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selected;
                    const dayEvents = eventsByDate[dateStr] ?? [];
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                    return (
                      <div key={dateStr} className={cn("border-r border-border/30 last:border-r-0", isWeekend && "bg-accent/[0.04]")}>
                        {/* Day header */}
                        <button
                          onClick={() => selectDay(dateStr)}
                          className={cn(
                            "w-full py-2 px-2 text-center border-b border-border/20 transition-colors hover:bg-accent/10 group relative",
                            isSelected && "bg-accent/20"
                          )}
                        >
                          <span className={cn(
                            "inline-flex w-7 h-7 items-center justify-center text-[11px] font-bold rounded-full",
                            isToday ? "bg-foreground text-background" :
                              isSelected ? "text-foreground" : "text-muted-foreground/55"
                          )}>
                            {day.getDate()}
                          </span>
                          {/* Quick-add in week view */}
                          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); setQuickAddDate(dateStr); }}
                              className="w-4 h-4 flex items-center justify-center text-muted-foreground/40 hover:text-foreground"
                            >
                              <Plus className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </button>

                        {/* All events — no truncation in week view */}
                        <div className="p-1.5 space-y-0.5 min-h-[240px]">
                          {dayEvents.map((ev) => (
                            <div key={ev.id} className="flex items-center gap-1 px-1.5 py-[3px] rounded-[3px]" style={{ backgroundColor: `${ev.color}15` }}>
                              <div className="w-[4px] h-[4px] rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
                              <span className="text-[9px] font-medium truncate leading-none" style={{ color: ev.color }}>
                                {ev.timeLabel ? `${ev.timeLabel} · ` : ""}{ev.summary}
                              </span>
                            </div>
                          ))}
                          {dayEvents.length === 0 && (
                            <div className="flex items-center justify-center h-16">
                              <span className="text-[9px] text-muted-foreground/20">—</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Side panel ────────────────────────────────────── */}
            <div className="flex flex-col border border-border overflow-hidden" data-calendar-side-panel>

              {/* Panel mode toggle header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-accent/5 no-print">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground/40 mb-0.5">
                    {panelMode === "day" ? selectedLabel : "Upcoming"}
                  </p>
                  <p className="text-xs text-muted-foreground/50">
                    {panelMode === "day"
                      ? selectedEvents.length === 0 ? "Nothing scheduled" : `${selectedEvents.length} event${selectedEvents.length !== 1 ? "s" : ""}`
                      : agendaDays.length === 0 ? "All clear ahead" : `${agendaDays.length} days with events`
                    }
                  </p>
                </div>
                <div className="flex border border-border/50 overflow-hidden">
                  {(["day", "agenda"] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setPanelMode(mode)}
                      className={cn(
                        "px-2.5 h-6 text-[9px] font-bold uppercase tracking-wide transition-colors",
                        panelMode === mode ? "bg-foreground text-background" : "text-muted-foreground/50 hover:text-foreground"
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Events list */}
              <div className="flex-1 overflow-y-auto">
                {panelMode === "day" ? (
                  /* Day mode */
                  <div className="p-3 space-y-1.5">
                    {selectedEvents.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-2">
                        <CalendarDays className="w-6 h-6 text-muted-foreground/15" />
                        <p className="text-[11px] text-muted-foreground/30 text-center">All clear</p>
                        <div className="flex gap-2 mt-1">
                          {data?.connected && (
                            <button
                              onClick={() => openEventDialog(selected)}
                              className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-foreground border border-border/40 px-2 py-1 transition-colors"
                            >
                              <Plus className="w-3 h-3" /> Add event
                            </button>
                          )}
                          <button
                            onClick={() => setQuickAddDate(selected)}
                            className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-foreground border border-border/40 px-2 py-1 transition-colors"
                          >
                            <Plus className="w-3 h-3" /> Add task
                          </button>
                        </div>
                      </div>
                    ) : (
                      selectedEvents.map((ev) => <EventCard key={ev.id} ev={ev} />)
                    )}
                  </div>
                ) : (
                  /* Agenda mode */
                  <div className="divide-y divide-border/30">
                    {agendaDays.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-2">
                        <CalendarDays className="w-6 h-6 text-muted-foreground/15" />
                        <p className="text-[11px] text-muted-foreground/30 text-center">Nothing in the next 2 weeks</p>
                      </div>
                    ) : (
                      agendaDays.map(dateStr => {
                        const events = eventsByDate[dateStr] ?? [];
                        const isToday = dateStr === todayStr;
                        const label = isToday ? "Today" : fmtDateFull(dateStr);
                        return (
                          <div key={dateStr}>
                            <button
                              onClick={() => selectDay(dateStr)}
                              className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-accent/10 transition-colors group"
                            >
                              <span className={cn(
                                "text-[10px] font-bold uppercase tracking-wide",
                                isToday ? "text-foreground" : "text-muted-foreground/50"
                              )}>
                                {label}
                              </span>
                              <span className="text-[9px] text-muted-foreground/30 ml-auto group-hover:text-muted-foreground/50">
                                {events.length}
                              </span>
                            </button>
                            <div className="px-3 pb-2 space-y-1">
                              {events.map(ev => <EventCard key={ev.id} ev={ev} showPhases={false} />)}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Legend */}
              {data && (
                <div className="px-5 py-4 border-t border-border/50 space-y-3 no-print">
                  {data.connected && (
                    <div className="space-y-1.5">
                      <p className="text-[9px] uppercase tracking-[0.12em] font-bold text-muted-foreground/30">Google Calendars</p>
                      {activeGoogleCalendars.length === 0
                        ? <p className="text-[10px] text-muted-foreground/30 italic">No events this month</p>
                        : activeGoogleCalendars.map(cal => (
                          <div key={cal.id} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                            <span className="text-[10px] text-muted-foreground/60 truncate">{cal.name}</span>
                          </div>
                        ))
                      }
                    </div>
                  )}
                  {(projectsInView.length > 0 || hasTasksInView) && (
                    <div className="space-y-1.5">
                      <p className="text-[9px] uppercase tracking-[0.12em] font-bold text-muted-foreground/30">PRDCR</p>
                      {projectsInView.map(p => (
                        <div key={p.color + p.name} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-[2px] shrink-0" style={{ backgroundColor: p.color }} />
                          <span className="text-[10px] text-muted-foreground/60 truncate">{p.name}</span>
                        </div>
                      ))}
                      {hasTasksInView && (
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0 bg-muted-foreground/30" />
                          <span className="text-[10px] text-muted-foreground/60">Task due dates</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Print-only schedule ───────────────────────────── */}
      <div className="print-schedule" style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#111", lineHeight: 1.5 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid #111", paddingBottom: "16px", marginBottom: "32px" }}>
          <div>
            <div style={{ fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 700, color: "#666", marginBottom: "4px" }}>PRDCR</div>
            <div style={{ fontSize: "28px", fontWeight: 900, letterSpacing: "-0.02em" }}>
              {MONTH_NAMES[month]} {year} — Production Schedule
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: "11px", color: "#888" }}>
            <div>Generated {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
            {data?.connected && <div style={{ marginTop: "2px" }}>Includes Google Calendar</div>}
          </div>
        </div>

        {/* No events */}
        {printScheduleDates.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#999", fontSize: "14px" }}>
            No events scheduled for {MONTH_NAMES[month]} {year}
          </div>
        )}

        {/* Days */}
        {printScheduleDates.map((dateStr) => {
          const d = new Date(dateStr + "T12:00:00");
          const isToday = dateStr === todayStr;
          const events = eventsByDate[dateStr] ?? [];
          const dayName = d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
          const dayDate = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });

          return (
            <div key={dateStr} style={{ marginBottom: "28px", breakInside: "avoid" }}>
              {/* Day header */}
              <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "10px" }}>
                <div style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.12em", color: isToday ? "#111" : "#555" }}>
                  {dayName}
                </div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#111" }}>{dayDate}</div>
                {isToday && (
                  <div style={{ marginLeft: "auto", fontSize: "9px", fontWeight: 800, letterSpacing: "0.12em", background: "#111", color: "#fff", padding: "2px 7px" }}>TODAY</div>
                )}
              </div>
              <div style={{ borderTop: "1px solid #e5e5e5", paddingTop: "10px" }}>
                {events.map((ev, ei) => {
                  // Type label + color bar
                  let typeLabel = "";
                  let barColor = ev.color;
                  if (ev.type === "google") {
                    typeLabel = ev.calendarName ?? "Google Calendar";
                    if (ev.timeLabel) typeLabel = `${ev.timeLabel}  ·  ${typeLabel}`;
                  } else if (ev.type === "project") {
                    typeLabel = "PROJECT DEADLINE";
                    barColor = ev.color;
                  } else {
                    typeLabel = `TASK${ev.priority ? `  ·  ${ev.priority.toUpperCase()}` : ""}`;
                  }

                  return (
                    <div key={ev.id} style={{ display: "flex", alignItems: "stretch", gap: "14px", marginBottom: ei < events.length - 1 ? "8px" : 0, breakInside: "avoid" }}>
                      {/* Color bar */}
                      <div style={{ width: "3px", background: barColor, borderRadius: "2px", flexShrink: 0 }} />
                      {/* Content */}
                      <div style={{ flex: 1, paddingTop: "1px", paddingBottom: "1px" }}>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "#111" }}>{ev.summary}</div>
                        <div style={{ fontSize: "10px", letterSpacing: "0.06em", color: "#888", marginTop: "2px", textTransform: "uppercase", fontWeight: 600 }}>{typeLabel}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Footer */}
        <div style={{ borderTop: "1px solid #e5e5e5", marginTop: "40px", paddingTop: "12px", display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#bbb", letterSpacing: "0.08em" }}>
          <span>PRDCR — PRODUCTION MANAGEMENT</span>
          <span>{MONTH_NAMES[month].toUpperCase()} {year}</span>
        </div>
      </div>

      {/* ── Features Guide Panel ──────────────────────────── */}
      {showFeatures && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setShowFeatures(false)} />
          <div className="relative bg-background border border-border shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <p className="text-sm font-bold text-foreground">What can I do here?</p>
                <p className="text-[11px] text-muted-foreground/50 mt-0.5">Everything the calendar supports</p>
              </div>
              <button onClick={() => setShowFeatures(false)} className="text-muted-foreground/40 hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-0.5">
              {[
                {
                  icon: <CalendarDays className="w-4 h-4" />,
                  color: "#6366f1",
                  title: "Add calendar event",
                  desc: "Click 'New Event' in the header or 'Add event' on any day to create a Google Calendar event",
                },
                {
                  icon: <Plus className="w-4 h-4" />,
                  color: "#8b5cf6",
                  title: "Quick-add task",
                  desc: "Hover any day → click + or 'Add task' to create a PRDCR task with the date pre-filled",
                },
                {
                  icon: <ArrowRight className="w-4 h-4" />,
                  color: "#8b5cf6",
                  title: "Convert event → task",
                  desc: "Click → Task on any Google event to turn it into a PRDCR task",
                },
                {
                  icon: <LayoutGrid className="w-4 h-4" />,
                  color: "#0ea5e9",
                  title: "Week view",
                  desc: "Toggle Month | Week in the nav bar for a focused 7-day layout",
                },
                {
                  icon: <List className="w-4 h-4" />,
                  color: "#10b981",
                  title: "Agenda",
                  desc: "Toggle Day | Agenda in the side panel for a rolling 14-day list",
                },
                {
                  icon: <Layers className="w-4 h-4" />,
                  color: "#f59e0b",
                  title: "Phase timeline",
                  desc: "Click ▼ phases on any project deadline to see production phases",
                },
                {
                  icon: <AlertTriangle className="w-4 h-4" />,
                  color: "#f97316",
                  title: "Conflict detection",
                  desc: "Amber banner appears automatically when 2+ deadlines land the same week",
                },
                {
                  icon: <MousePointerClick className="w-4 h-4" />,
                  color: "#ec4899",
                  title: "Click any day",
                  desc: "Select a date to see all events for that day in the side panel",
                },
                {
                  icon: <Printer className="w-4 h-4" />,
                  color: "#64748b",
                  title: "Print schedule",
                  desc: "Click Print in the top bar to export a clean calendar to PDF",
                },
                {
                  icon: <CalendarDays className="w-4 h-4" />,
                  color: "#4285f4",
                  title: "Google Calendar sync",
                  desc: "Connect or disconnect Google Calendar from the top-right corner",
                },
              ].map(({ icon, color, title, desc }) => (
                <div key={title} className="flex items-start gap-3 px-3 py-2.5 rounded-sm hover:bg-accent/10 transition-colors group">
                  <div className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md mt-0.5" style={{ backgroundColor: `${color}18`, color }}>
                    {icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-foreground leading-none mb-1">{title}</p>
                    <p className="text-[11px] text-muted-foreground/60 leading-snug">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-3 border-t border-border/50">
              <p className="text-[10px] text-muted-foreground/30 text-center">Press Esc or click outside to close</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Google Calendar Event Dialog ─────────────────── */}
      {eventDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={closeEventDialog} />
          <div className="relative bg-background border border-border shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <p className="text-sm font-bold text-foreground">New Calendar Event</p>
                <p className="text-[11px] text-muted-foreground/50 mt-0.5">Adds to your primary Google Calendar</p>
              </div>
              <button onClick={closeEventDialog} className="text-muted-foreground/40 hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateEvent} className="p-5 space-y-3">
              <input
                ref={eventTitleRef}
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                required
                placeholder="Event title…"
                className={fieldClass}
              />
              <input
                value={eventLocation}
                onChange={(e) => setEventLocation(e.target.value)}
                placeholder="Location or address (optional)…"
                className={fieldClass}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-semibold block mb-1">Date</label>
                  <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required className={fieldClass} />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                    <input type="checkbox" checked={eventAllDay} onChange={(e) => setEventAllDay(e.target.checked)} className="rounded" />
                    All-day event
                  </label>
                </div>
              </div>
              {!eventAllDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-semibold block mb-1">Start Time</label>
                    <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} required className={fieldClass} />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-semibold block mb-1">End Time</label>
                    <input type="time" value={eventEndTime} onChange={(e) => setEventEndTime(e.target.value)} required className={fieldClass} />
                  </div>
                </div>
              )}
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-semibold block">
                    Notes (optional)
                  </label>
                  <div className="flex items-center gap-2">
                    {(isEventNotesFormatting || isEventNotesFinalizing) && (
                      <span className="text-[10px] text-muted-foreground/60">
                        {isEventNotesFinalizing ? "Final polish…" : "Tidying…"}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={toggleEventNotesDictation}
                      disabled={isEventNotesFinalizing}
                      className={cn(
                        "flex items-center gap-1 text-[10px] px-2 py-0.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                        isEventNotesRecording
                          ? "border-red-400/60 text-red-400 bg-red-400/5"
                          : "border-border/40 text-muted-foreground/50 hover:text-foreground"
                      )}
                    >
                      {isEventNotesRecording ? <MicOff className="w-2.5 h-2.5" /> : <Mic className="w-2.5 h-2.5" />}
                      {isEventNotesRecording ? "Stop" : "Dictate"}
                      {isEventNotesRecording && <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />}
                      {!isEventNotesRecording && (isEventNotesFormatting || isEventNotesFinalizing) && (
                        <Wand2 className="w-2.5 h-2.5" />
                      )}
                    </button>
                  </div>
                </div>
                <textarea
                  value={eventNotes}
                  onChange={(e) => setEventNotes(e.target.value)}
                  readOnly={isEventNotesRecording || isEventNotesFinalizing}
                  placeholder="Description or notes…"
                  rows={2}
                  className={cn(
                    fieldClass,
                    "resize-none",
                    (isEventNotesRecording || isEventNotesFinalizing) && "cursor-not-allowed text-foreground/80"
                  )}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={closeEventDialog} className="px-3 py-2 text-xs border border-border/50 text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingEvent || !eventTitle.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 bg-foreground text-background font-semibold hover:bg-foreground/85 disabled:opacity-40 transition-colors"
                >
                  {isCreatingEvent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  {isCreatingEvent ? "Adding…" : "Add to Calendar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Quick-add / Convert Task Dialog ──────────────────── */}
      {taskDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => { setQuickAddDate(null); setConvertEvent(null); setTaskFormError(""); }}
          />
          {/* Dialog */}
          <div className="relative bg-background border border-border shadow-xl w-full max-w-sm mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <p className="text-sm font-bold text-foreground">
                  {convertEvent ? "Create task from event" : "Add task"}
                </p>
                <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                  Due {fmtDateFull(taskDialogDate)}
                </p>
              </div>
              <button
                onClick={() => { setQuickAddDate(null); setConvertEvent(null); setTaskFormError(""); }}
                className="text-muted-foreground/40 hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateTask} className="p-5 space-y-3">
              <input type="hidden" name="due_date" value={taskDialogDate} />

              <div>
                <input
                  name="title"
                  autoFocus
                  required
                  defaultValue={taskDialogTitle}
                  placeholder="Task name…"
                  className={fieldClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-semibold block mb-1">Priority</label>
                  <select name="priority" defaultValue="medium" className={fieldClass}>
                    {PRIORITY_OPTS.map(p => (
                      <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground/50 font-semibold block mb-1">Project</label>
                  <select name="project_id" defaultValue="" className={fieldClass}>
                    <option value="">None</option>
                    {(data?.availableProjects ?? []).map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              {taskFormError && (
                <p className="text-xs text-destructive">{taskFormError}</p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setQuickAddDate(null); setConvertEvent(null); setTaskFormError(""); }}
                  className="px-4 py-2 text-sm text-muted-foreground border border-border/50 hover:text-foreground hover:border-border transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingTask}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-foreground text-background hover:bg-foreground/85 transition-colors disabled:opacity-50"
                >
                  {isCreatingTask && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
