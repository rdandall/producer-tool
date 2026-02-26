"use client";

import { useState, useEffect, useCallback, useMemo, useTransition, type FormEvent } from "react";
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
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { createTaskAction } from "@/app/actions";
import type { GoogleCalendarEvent, GoogleCalendar } from "@/lib/google-calendar";
import type { PrdcrEvent } from "@/app/api/calendar/events/route";
import type { Phase } from "@/lib/db/projects";

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

  // ── Conflict detection state ─────────────────────────────────────
  const [dismissedConflicts, setDismissedConflicts] = useState<Set<string>>(new Set());

  // ── Phase expansion state ────────────────────────────────────────
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  // Strip ?connected=true from URL after OAuth redirect
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("connected") === "true") {
      window.history.replaceState({}, "", "/dashboard/calendar");
    }
  }, []);

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
          [data-sidebar] { display: none !important; }
          [data-calendar-side-panel] { display: none !important; }
          .no-print { display: none !important; }
          [data-calendar-main] { max-width: 100% !important; padding: 16px !important; }
          [data-calendar-grid] { grid-template-columns: 1fr !important; }
          @page { margin: 1.5cm; }
        }
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
              {/* Print button */}
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border/50 hover:border-foreground/30 hover:text-foreground transition-colors"
              >
                <Printer className="w-3 h-3" /> Print
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
              <div className="flex items-center justify-between px-5 py-4 border-b border-border no-print">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-bold tracking-tight">
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
                        <div key={`empty-${i}`} className={cn("min-h-[130px] bg-accent/[0.03]", !isLastCol && "border-r border-border/30", !isLastRow && "border-b border-border/30")} />
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
                          "min-h-[130px] p-2 text-left transition-colors focus:outline-none group relative",
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
                    const isLastCol = day.getDay() === 6;

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
                        <button
                          onClick={() => setQuickAddDate(selected)}
                          className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-foreground border border-border/40 px-2 py-1 transition-colors"
                        >
                          <Plus className="w-3 h-3" /> Add task
                        </button>
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
