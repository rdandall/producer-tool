"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Loader2,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { GoogleCalendarEvent, } from "@/lib/google-calendar";
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
}

interface CalendarData {
  googleEvents: GoogleCalendarEvent[];
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
  // Pad to complete last row
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
      eventsByDate[d].push({ id: ev.id, summary: ev.summary, color: ev.color, type: "task" });
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

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-8 py-8">

        {/* ── Page header ──────────────────────────────────── */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">Calendar</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Shoot days, deadlines, and project milestones
            </p>
          </div>

          {data && !data.connected && (
            <a
              href="/api/auth/google"
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-foreground text-background hover:bg-foreground/85 transition-colors"
            >
              <CalendarDays className="w-4 h-4" />
              Connect Google Calendar
            </a>
          )}
          {data?.connected && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Google Calendar synced
            </div>
          )}
        </div>

        {/* ── Main layout: calendar + day panel ────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">

          {/* Calendar grid */}
          <div className="border border-border overflow-hidden">

            {/* Month navigation bar */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
              <h2 className="text-sm font-bold tracking-tight">
                {MONTH_NAMES[month]} {year}
              </h2>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={prevMonth}
                  className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={goToday}
                  className="px-2.5 h-7 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                >
                  Today
                </button>
                <button
                  onClick={nextMonth}
                  className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                  aria-label="Next month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 border-b border-border">
              {DAYS_SHORT.map((d) => (
                <div key={d} className="py-2 text-center">
                  <span className="text-[10px] uppercase tracking-[0.1em] font-semibold text-muted-foreground/40">
                    {d}
                  </span>
                </div>
              ))}
            </div>

            {/* Day cells */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
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
                          "min-h-[88px] bg-accent/5",
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
                  const visible = dayEvents.slice(0, 2);
                  const overflow = dayEvents.length - visible.length;

                  return (
                    <button
                      key={dateStr}
                      onClick={() => setSelected(dateStr)}
                      className={cn(
                        "min-h-[88px] p-1.5 text-left transition-colors focus:outline-none",
                        !isLastCol && "border-r border-border/30",
                        !isLastRow && "border-b border-border/30",
                        isSelected ? "bg-accent/25" : "hover:bg-accent/10"
                      )}
                    >
                      {/* Date number */}
                      <div className="mb-1">
                        <span
                          className={cn(
                            "inline-flex w-6 h-6 items-center justify-center text-[11px] font-semibold",
                            isToday
                              ? "bg-foreground text-background rounded-full"
                              : isSelected
                                ? "text-foreground"
                                : "text-muted-foreground/50"
                          )}
                        >
                          {day.getDate()}
                        </span>
                      </div>

                      {/* Event chips */}
                      <div className="space-y-0.5">
                        {visible.map((ev) => (
                          <div
                            key={ev.id}
                            className="flex items-center gap-1 px-1 py-0.5 rounded-sm"
                            style={{ backgroundColor: `${ev.color}18` }}
                          >
                            <div
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: ev.color }}
                            />
                            <span
                              className="text-[10px] font-medium truncate leading-none"
                              style={{ color: ev.color }}
                            >
                              {ev.timeLabel ? `${ev.timeLabel} ` : ""}{ev.summary}
                            </span>
                          </div>
                        ))}
                        {overflow > 0 && (
                          <span className="text-[10px] text-muted-foreground/40 pl-1">
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

          {/* ── Day detail panel ─────────────────────────── */}
          <div className="border border-border overflow-hidden">
            <div className="px-4 py-3.5 border-b border-border">
              <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/50">
                {selectedLabel}
              </p>
            </div>

            <div className="p-3 space-y-1.5 overflow-y-auto max-h-[520px]">
              {selectedEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground/30 text-center py-10">
                  Nothing scheduled
                </p>
              ) : (
                selectedEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="px-3 py-2.5 rounded-sm"
                    style={{ borderLeft: `2px solid ${ev.color}`, backgroundColor: `${ev.color}0d` }}
                  >
                    {ev.href ? (
                      <Link
                        href={ev.href}
                        className="flex items-start gap-1.5 group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors leading-snug">
                            {ev.summary}
                          </p>
                          <p className="text-[10px] text-muted-foreground/50 mt-0.5 capitalize">
                            {ev.type === "project" ? "Project deadline" : ev.type === "task" ? "Task due" : "Calendar event"}
                            {ev.timeLabel && <> · {ev.timeLabel}</>}
                          </p>
                        </div>
                        <ExternalLink className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground/30 group-hover:text-primary/50 transition-colors" />
                      </Link>
                    ) : (
                      <div>
                        <p className="text-sm font-medium text-foreground leading-snug">{ev.summary}</p>
                        <p className="text-[10px] text-muted-foreground/50 mt-0.5 capitalize">
                          {ev.type === "google" ? "Google Calendar" : ev.type === "task" ? "Task due" : "Deadline"}
                          {ev.timeLabel && <> · {ev.timeLabel}</>}
                        </p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Legend */}
            {data && (
              <div className="px-4 py-3 border-t border-border/50 space-y-1.5">
                <p className="text-[9px] uppercase tracking-[0.1em] font-semibold text-muted-foreground/30 mb-2">Legend</p>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#4285f4]" />
                  <span className="text-[10px] text-muted-foreground/50">Google Calendar</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-[10px] text-muted-foreground/50">Project deadline</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                  <span className="text-[10px] text-muted-foreground/50">Task due date</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
