/** Google Calendar OAuth + API helpers (no googleapis SDK — direct fetch). */

const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

// ── Types ────────────────────────────────────────────────────────────

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: string; // ISO date or datetime string
  end: string;
  calendarId: string;
  calendarName: string;
  calendarColor: string;
  allDay: boolean;
}

export interface GoogleCalendar {
  id: string;
  name: string;
  color: string;
}

// ── OAuth helpers ────────────────────────────────────────────────────

/** Build the Google OAuth consent screen URL. */
export function getGoogleAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ].join(" "),
    access_type: "offline",
    prompt: "consent", // force refresh_token to always be returned
  });
  return `${GOOGLE_OAUTH_URL}?${params}`;
}

/** Exchange an authorization code for access + refresh tokens. */
export async function exchangeGoogleCode(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? "Token exchange failed");
  return data;
}

/** Use a refresh token to get a new access token. */
export async function refreshGoogleToken(refreshToken: string): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? "Token refresh failed");
  return data.access_token;
}

// ── Calendar API ─────────────────────────────────────────────────────

/** Fetch events from all calendars for a given date range. */
export async function fetchGoogleCalendarEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<{ events: GoogleCalendarEvent[]; calendars: GoogleCalendar[] }> {
  // 1. Get list of all calendars
  const calsRes = await fetch(`${GOOGLE_CALENDAR_BASE}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!calsRes.ok) throw new Error("Failed to fetch calendar list");
  const calsData = await calsRes.json();
  const rawCalendars: Array<{
    id: string;
    summary: string;
    backgroundColor: string;
    accessRole: string;
  }> = calsData.items ?? [];

  const accessibleCals = rawCalendars.filter((c) => c.accessRole !== "freeBusyReader");

  // 2. Fetch events from each accessible calendar in parallel
  const eventArrays = await Promise.all(
    accessibleCals.map(async (cal) => {
        const url =
          `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(cal.id)}/events?` +
          new URLSearchParams({
            timeMin,
            timeMax,
            singleEvents: "true",
            orderBy: "startTime",
            maxResults: "250",
          });
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return [];
        const data = await res.json();

        return (data.items ?? []).map(
          (ev: {
            id: string;
            summary?: string;
            start: { dateTime?: string; date?: string };
            end: { dateTime?: string; date?: string };
          }): GoogleCalendarEvent => ({
            id: ev.id,
            summary: ev.summary ?? "(No title)",
            start: ev.start.dateTime ?? ev.start.date ?? "",
            end: ev.end.dateTime ?? ev.end.date ?? "",
            calendarId: cal.id,
            calendarName: cal.summary,
            calendarColor: cal.backgroundColor ?? "#4285f4",
            allDay: !ev.start.dateTime,
          })
        );
      })
  );

  const calendars: GoogleCalendar[] = accessibleCals.map((c) => ({
    id: c.id,
    name: c.summary,
    color: c.backgroundColor ?? "#4285f4",
  }));

  return { events: eventArrays.flat(), calendars };
}

/** Create a new event in the user's primary Google Calendar. */
export async function createGoogleCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    location?: string;
    startDateTime: string; // ISO 8601, e.g. "2026-03-13T18:30:00"
    endDateTime: string;
    timeZone?: string;
    allDay?: boolean;
    startDate?: string; // "YYYY-MM-DD" for all-day
    endDate?: string;
  }
): Promise<{ id: string; htmlLink: string }> {
  const body = event.allDay
    ? {
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: { date: event.startDate },
        end: { date: event.endDate ?? event.startDate },
      }
    : {
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: { dateTime: event.startDateTime, timeZone: event.timeZone ?? "UTC" },
        end: { dateTime: event.endDateTime, timeZone: event.timeZone ?? "UTC" },
      };

  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/calendars/primary/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message ?? "Failed to create calendar event");
  }
  const data = await res.json();
  return { id: data.id, htmlLink: data.htmlLink };
}
