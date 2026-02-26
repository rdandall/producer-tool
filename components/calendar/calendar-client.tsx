"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Loader2,
  ExternalLink,
  Unlink,
  X,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { GoogleCalendarEvent, GoogleCalendar } from "@/lib/google-calendar";
import type { PrdcrEvent } from "@/app/api/calendar/events/route";

// ── Constants ────────────────────────────────────────────────────────
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
}

interface CalendarData {
  googleEvents: GoogleCalendarEvent[];
  googleCalendars: GoogleCalendar[];
  projectDeadlines: PrdcrEvent[];
  taskDeadlines: PrdcrEvent[];
  connected: boolean;
  error?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getEventDate(iso: string) {
  return iso.substring(0, 10);
}

function formatTime(iso: string): string | undefined {
  if (iso.length === 10) return undefined; // all-day
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

// ── Main Component ───────────────────────────────────────────────────
export function CalendarClient() {
  const today = new Date();
  const todayStr = toDateStr(today);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<string>(todayStr);
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Strip ?connected=true from URL after redirect
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("connected") === "true") {
      window.history.replaceState({}, "", "/dashboard/calendar");
    }
  }, []);

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

  // Month navigation
  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }
  function goToday() { setYear(today.getFullYear()); setMonth(today.getMonth()); }

  // Build event map: dateStr → DayEvent[]
  const eventsByDate: Record<string, DayEvent[]> = {};
  if (data) {
    for (const ev of data.googleEvents) {
      const d = getEventDate(ev.start);
      eventsByDate[d] ??= [];
      eventsByDate[d].push({
        id: ev.id,
        summary: ev.summary,
        color: ev.calendarColor,
        type: "google",
        timeLabel: formatTime(ev.start),
        calendarName: ev.calendarName,
      });
    }
    for (const ev of data.projectDeadlines) {
      const d = getEventDate(ev.start);
      eventsByDate[d] ??= [];
      eventsByDate[d].push({ id: ev.id, summary: ev.summary, color: ev.color, type: "project", href: ev.href });
    }
    for (const ev of data.taskDeadlines) {
      const d = getEventDate(ev.start);
      eventsByDate[d] ??= [];
      eventsByDate[d].push({ id: ev.id, summary: ev.summary, color: ev.color, type: "task", priority: ev.priority });
    }
  }

  const gridDays = buildGridDays(year, month);
  const selectedEvents = eventsByDate[selected] ?? [];

  // Format the selected date for the detail panel header
  const selectedLabel = (() => {
    if (selected === todayStr) return "Today";
    const d = new Date(selected + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  })();

  // Build dynamic legend from actual data in the current view
  const calendarIdsWithEvents = data?.connected
    ? new Set(data.googleEvents.map((ev) => ev.calendarId))
    : new Set<string>();

  const activeGoogleCalendars = (data?.googleCalendars ?? []).filter(
    (c) => calendarIdsWithEvents.has(c.id)
  );

  // Unique project colors+names from project deadlines in view
  const projectsInView = (() => {
    const seen = new Map<string, { name: string; color: string }>();
    for (const ev of data?.projectDeadlines ?? []) {
      const key = ev.color;
      if (!seen.has(key)) seen.set(key, { name: ev.summary.replace(/ deadline$/, ""), color: ev.color });
    }
    return [...seen.values()];
  })();

  const hasTasksInView = (data?.taskDeadlines ?? []).length > 0;

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-7xl mx-auto px-8 py-8">

        {/* ── Page header ──────────────────────────────────── */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">Calendar</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Shoot days, deadlines, and project milestones
            </p>
          </div>

          <div className="flex items-center gap-3">
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
                  <Unlink className="w-3 h-3" />
                  Disconnect
                </button>
              </div>
            )}

            {confirmDisconnect && (
              <div className="flex items-center gap-2 px-3 py-1.5 border border-destructive/30 bg-destructive/5">
                <span className="text-xs text-foreground/70">Disconnect Google Calendar?</span>
                <button
                  onClick={() => setConfirmDisconnect(false)}
                  className="px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground border border-border/40 transition-colors"
                >
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

        {/* ── Main layout: calendar + side panel ────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

          {/* ── Calendar grid ─────────────────────────────────── */}
          <div className="border border-border overflow-hidden">

            {/* Month navigation bar */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-bold tracking-tight">
                {MONTH_NAMES[month]} <span className="text-muted-foreground/50 font-normal">{year}</span>
              </h2>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={prevMonth}
                  className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                  aria-label="Previous month"
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
                  onClick={nextMonth}
                  className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                  aria-label="Next month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 border-b border-border bg-accent/5">
              {DAYS_SHORT.map((d) => (
                <div key={d} className="py-2.5 text-center">
                  <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground/40">
                    {d}
                  </span>
                </div>
              ))}
            </div>

            {/* Day cells */}
            {loading ? (
              <div className="flex items-center justify-center py-32">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/30" />
              </div>
            ) : (
              <div className="grid grid-cols-7">
                {gridDays.map((day, i) => {
                  const isLastCol = i % 7 === 6;
                  const isLastRow = i >= gridDays.length - 7;

                  if (!day) {
                    return (
                      <div
                        key={`empty-${i}`}
                        className={cn(
                          "min-h-[130px] bg-accent/[0.03]",
                          !isLastCol && "border-r border-border/30",
                          !isLastRow && "border-b border-border/30"
                        )}
                      />
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
                      onClick={() => setSelected(dateStr)}
                      className={cn(
                        "min-h-[130px] p-2 text-left transition-colors focus:outline-none group",
                        !isLastCol && "border-r border-border/30",
                        !isLastRow && "border-b border-border/30",
                        isWeekend && !isSelected && "bg-accent/[0.04]",
                        isSelected ? "bg-accent/20 ring-1 ring-inset ring-border/50" : "hover:bg-accent/10"
                      )}
                    >
                      {/* Date number */}
                      <div className="mb-1.5 flex items-start justify-between">
                        <span
                          className={cn(
                            "inline-flex w-7 h-7 items-center justify-center text-[11px] font-bold",
                            isToday
                              ? "bg-foreground text-background rounded-full"
                              : isSelected
                                ? "text-foreground"
                                : isWeekend
                                  ? "text-muted-foreground/35"
                                  : "text-muted-foreground/55"
                          )}
                        >
                          {day.getDate()}
                        </span>
                        {dayEvents.length > 0 && !isSelected && (
                          <span className="text-[9px] text-muted-foreground/25 font-medium tabular-nums mt-1 group-hover:text-muted-foreground/40 transition-colors">
                            {dayEvents.length}
                          </span>
                        )}
                      </div>

                      {/* Event chips */}
                      <div className="space-y-0.5">
                        {visible.map((ev) => (
                          <div
                            key={ev.id}
                            className="flex items-center gap-1.5 px-1.5 py-[3px] rounded-[3px]"
                            style={{ backgroundColor: `${ev.color}15` }}
                          >
                            <div
                              className="w-[5px] h-[5px] rounded-full shrink-0"
                              style={{ backgroundColor: ev.color }}
                            />
                            <span
                              className="text-[10px] font-medium truncate leading-none"
                              style={{ color: ev.color }}
                            >
                              {ev.timeLabel ? `${ev.timeLabel} · ` : ""}{ev.summary}
                            </span>
                          </div>
                        ))}
                        {overflow > 0 && (
                          <span className="text-[10px] text-muted-foreground/35 pl-1.5 font-medium">
                            +{overflow} more
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Side panel ────────────────────────────────────── */}
          <div className="flex flex-col border border-border overflow-hidden">

            {/* Day detail header */}
            <div className="px-5 py-4 border-b border-border bg-accent/5">
              <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground/40 mb-0.5">
                {selectedLabel}
              </p>
              <p className="text-xs text-muted-foreground/50">
                {selectedEvents.length === 0
                  ? "Nothing scheduled"
                  : `${selectedEvents.length} event${selectedEvents.length !== 1 ? "s" : ""}`}
              </p>
            </div>

            {/* Events list */}
            <div className="flex-1 p-3 space-y-1.5 overflow-y-auto">
              {selectedEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <CalendarDays className="w-6 h-6 text-muted-foreground/15" />
                  <p className="text-[11px] text-muted-foreground/30 text-center">
                    All clear
                  </p>
                </div>
              ) : (
                selectedEvents.map((ev) => (
                  <div
                    key={ev.id}
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
                        <p className="text-sm font-semibold text-foreground leading-snug">{ev.summary}</p>
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
                  </div>
                ))
              )}
            </div>

            {/* ── Legend ──────────────────────────────────────── */}
            {data && (
              <div className="px-5 py-4 border-t border-border/50 space-y-3">
                {/* Google Calendars section */}
                {data.connected && (
                  <div className="space-y-1.5">
                    <p className="text-[9px] uppercase tracking-[0.12em] font-bold text-muted-foreground/30">
                      Google Calendars
                    </p>
                    {activeGoogleCalendars.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground/30 italic">No events this month</p>
                    ) : (
                      activeGoogleCalendars.map((cal) => (
                        <div key={cal.id} className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: cal.color }}
                          />
                          <span className="text-[10px] text-muted-foreground/60 truncate">{cal.name}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* PRDCR section */}
                {(projectsInView.length > 0 || hasTasksInView) && (
                  <div className="space-y-1.5">
                    <p className="text-[9px] uppercase tracking-[0.12em] font-bold text-muted-foreground/30">
                      PRDCR
                    </p>
                    {projectsInView.map((p) => (
                      <div key={p.color + p.name} className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-[2px] shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
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

                {/* Nothing in legend when not connected and no PRDCR events */}
                {!data.connected && projectsInView.length === 0 && !hasTasksInView && (
                  <p className="text-[10px] text-muted-foreground/25 italic">No events this month</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
