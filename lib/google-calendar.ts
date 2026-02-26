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

// ── OAuth helpers ────────────────────────────────────────────────────

/** Build the Google OAuth consent screen URL. */
export function getGoogleAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
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
): Promise<GoogleCalendarEvent[]> {
  // 1. Get list of all calendars
  const calsRes = await fetch(`${GOOGLE_CALENDAR_BASE}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!calsRes.ok) throw new Error("Failed to fetch calendar list");
  const calsData = await calsRes.json();
  const calendars: Array<{
    id: string;
    summary: string;
    backgroundColor: string;
    accessRole: string;
  }> = calsData.items ?? [];

  // 2. Fetch events from each accessible calendar in parallel
  const eventArrays = await Promise.all(
    calendars
      .filter((c) => c.accessRole !== "freeBusyReader")
      .map(async (cal) => {
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

  return eventArrays.flat();
}
