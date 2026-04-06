"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Calendar as CalendarIcon,
  List,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  type: "google" | "project" | "task";
  color?: string;
  location?: string;
}

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatEventTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function isSameDay(d1: Date, d2: Date) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export function MobileCalendar() {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"month" | "agenda">("month");

  // Fetch events
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      const res = await fetch(
        `/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`
      );
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } catch {
      toast.error("Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Calendar grid
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: Array<{ date: Date | null; isToday: boolean; hasEvents: boolean }> = [];

    const today = new Date();

    // Padding for first week
    for (let i = 0; i < firstDay; i++) days.push({ date: null, isToday: false, hasEvents: false });

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const isToday = isSameDay(date, today);
      const hasEvents = events.some((e) => isSameDay(new Date(e.start), date));
      days.push({ date, isToday, hasEvents });
    }

    return days;
  }, [currentMonth, events]);

  // Events for selected date
  const selectedEvents = useMemo(
    () =>
      events
        .filter((e) => isSameDay(new Date(e.start), selectedDate))
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [events, selectedDate]
  );

  // All events for agenda view, sorted
  const agendaEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
      ),
    [events]
  );

  const prevMonth = () => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const TYPE_COLORS: Record<string, string> = {
    google: "bg-blue-500",
    project: "bg-emerald-500",
    task: "bg-amber-500",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-black tracking-tight">Calendar</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setView(view === "month" ? "agenda" : "month")}
              className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {view === "month" ? <List className="w-4 h-4" /> : <CalendarIcon className="w-4 h-4" />}
            </button>
            <button
              onClick={fetchEvents}
              className={cn(
                "w-8 h-8 flex items-center justify-center text-muted-foreground",
                loading && "animate-spin"
              )}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Month nav */}
        <div className="flex items-center justify-between">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="text-sm font-semibold">
            {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </p>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {view === "month" ? (
        <>
          {/* Calendar grid */}
          <div className="shrink-0 px-3 py-2">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS.map((d, i) => (
                <div key={i} className="text-center text-[10px] font-medium text-muted-foreground/50 py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Date grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {calendarDays.map((day, i) => {
                if (!day.date) {
                  return <div key={`pad-${i}`} className="aspect-square" />;
                }

                const isSelected = isSameDay(day.date, selectedDate);
                return (
                  <button
                    key={day.date.toISOString()}
                    onClick={() => setSelectedDate(day.date!)}
                    className={cn(
                      "aspect-square flex flex-col items-center justify-center rounded-lg text-[13px] transition-colors relative",
                      isSelected
                        ? "bg-primary text-primary-foreground font-bold"
                        : day.isToday
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-foreground active:bg-accent/30"
                    )}
                  >
                    {day.date.getDate()}
                    {day.hasEvents && !isSelected && (
                      <div className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected date events */}
          <div className="flex-1 overflow-auto px-4 pb-4">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/50 mb-2 mt-1">
              {selectedDate.toLocaleDateString([], {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>

            {selectedEvents.length > 0 ? (
              <div className="space-y-2">
                {selectedEvents.map((event) => (
                  <Card key={event.id} className="overflow-hidden">
                    <CardContent className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "w-1 self-stretch rounded-full shrink-0 mt-0.5",
                            event.color
                              ? ""
                              : TYPE_COLORS[event.type] ?? "bg-muted"
                          )}
                          style={event.color ? { backgroundColor: event.color } : undefined}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-foreground">{event.title}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {event.allDay
                              ? "All day"
                              : `${formatEventTime(event.start)}${event.end ? ` - ${formatEventTime(event.end)}` : ""}`}
                          </p>
                          {event.location && (
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">
                              {event.location}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-[12px] text-muted-foreground">No events</p>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Agenda view */
        <div className="flex-1 overflow-auto px-4 py-3">
          {agendaEvents.length > 0 ? (
            <div className="space-y-2">
              {agendaEvents.map((event) => (
                <Card key={event.id} className="overflow-hidden">
                  <CardContent className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "w-1 self-stretch rounded-full shrink-0",
                          event.color ? "" : TYPE_COLORS[event.type] ?? "bg-muted"
                        )}
                        style={event.color ? { backgroundColor: event.color } : undefined}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold">{event.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(event.start).toLocaleDateString([], {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                          {!event.allDay && ` · ${formatEventTime(event.start)}`}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-[13px] text-muted-foreground">No events this month</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
