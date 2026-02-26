import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db/settings";
import {
  refreshGoogleToken,
  fetchGoogleCalendarEvents,
  type GoogleCalendarEvent,
  type GoogleCalendar,
} from "@/lib/google-calendar";
import { getProjects } from "@/lib/db/projects";
import { getAllTasks } from "@/lib/db/tasks";

export interface PrdcrEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  type: "project" | "task";
  color: string;
  priority?: string | null;
  href?: string;
}

export interface CalendarEventsResponse {
  googleEvents: GoogleCalendarEvent[];
  googleCalendars: GoogleCalendar[];
  projectDeadlines: PrdcrEvent[];
  taskDeadlines: PrdcrEvent[];
  connected: boolean;
  error?: string;
}

export async function GET(req: NextRequest): Promise<NextResponse<CalendarEventsResponse>> {
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth()));

  // Broad date range: full month ± 1 week to fill the calendar grid
  const timeMin = new Date(year, month - 1, 1).toISOString();
  const timeMax = new Date(year, month + 2, 0, 23, 59, 59).toISOString();

  // ── Google Calendar events ──────────────────────────────────────────
  const refreshToken = await getSetting("google_refresh_token");
  let googleEvents: GoogleCalendarEvent[] = [];
  let googleCalendars: GoogleCalendar[] = [];
  let googleError: string | undefined;

  if (refreshToken) {
    try {
      // Use cached access token if still valid (with 60s buffer)
      let accessToken = await getSetting("google_access_token");
      const expiryStr = await getSetting("google_token_expiry");
      const expired = !expiryStr || Date.now() > parseInt(expiryStr) - 60_000;

      if (!accessToken || expired) {
        accessToken = await refreshGoogleToken(refreshToken);
        await setSetting("google_access_token", accessToken);
        await setSetting(
          "google_token_expiry",
          String(Date.now() + 3600 * 1000) // 1 hour
        );
      }

      const result = await fetchGoogleCalendarEvents(accessToken, timeMin, timeMax);
      googleEvents = result.events;
      googleCalendars = result.calendars;
    } catch (err) {
      console.error("Google Calendar error:", err);
      googleError = "Failed to fetch Google Calendar events";
    }
  }

  // ── PRDCR data ──────────────────────────────────────────────────────
  const [projects, tasks] = await Promise.all([getProjects(), getAllTasks()]);

  const projectDeadlines: PrdcrEvent[] = projects
    .filter((p) => p.due_date)
    .map((p) => ({
      id: `project-${p.id}`,
      summary: `${p.title} deadline`,
      start: p.due_date!,
      end: p.due_date!,
      type: "project" as const,
      color: p.color,
      href: `/dashboard/projects/${p.id}`,
    }));

  const taskDeadlines: PrdcrEvent[] = tasks
    .filter((t) => t.due_date && !t.completed)
    .map((t) => ({
      id: `task-${t.id}`,
      summary: t.title,
      start: t.due_date!,
      end: t.due_date!,
      type: "task" as const,
      color: t.projects?.color ?? "#888888",
      priority: t.priority,
    }));

  return NextResponse.json({
    googleEvents,
    googleCalendars,
    projectDeadlines,
    taskDeadlines,
    connected: !!refreshToken,
    ...(googleError ? { error: googleError } : {}),
  });
}
