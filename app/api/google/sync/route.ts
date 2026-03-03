import { NextResponse } from "next/server";
import { google } from "googleapis";
import {
  getGoogleConnection,
  replaceEventsForSource,
  upsertCalendarSource,
  upsertGoogleConnection,
} from "@/lib/db/calendar";
import { getGoogleOauthClient } from "@/lib/google";

export async function POST(req: Request) {
  const url = new URL(req.url);

  try {
    const connection = await getGoogleConnection();
    if (!connection) {
      return NextResponse.json({ error: "Google Calendar is not connected" }, { status: 400 });
    }

    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${url.origin}/api/google/callback`;
    const oauth = getGoogleOauthClient(redirectUri);

    oauth.setCredentials({
      access_token: connection.access_token,
      refresh_token: connection.refresh_token || undefined,
      expiry_date: connection.expiry_date ? new Date(connection.expiry_date).getTime() : undefined,
    });

    oauth.on("tokens", async (tokens) => {
      if (!tokens.access_token && !tokens.refresh_token && !tokens.expiry_date) return;
      await upsertGoogleConnection({
        access_token: tokens.access_token || connection.access_token,
        refresh_token: tokens.refresh_token || connection.refresh_token,
        expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : connection.expiry_date,
        scope: tokens.scope || connection.scope,
        token_type: tokens.token_type || connection.token_type,
        email: connection.email,
      });
    });

    const calendar = google.calendar({ version: "v3", auth: oauth });
    const calendars = await calendar.calendarList.list();

    const list = calendars.data.items ?? [];
    const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

    let totalEvents = 0;

    for (const cal of list) {
      if (!cal.id) continue;

      const source = await upsertCalendarSource({
        google_calendar_id: cal.id,
        summary: cal.summary ?? null,
        timezone: cal.timeZone ?? null,
        primary_calendar: !!cal.primary,
        selected: true,
      });

      const eventsRes = await calendar.events.list({
        calendarId: cal.id,
        singleEvents: true,
        orderBy: "startTime",
        timeMin,
        timeMax,
        maxResults: 500,
      });

      const mappedEvents = (eventsRes.data.items ?? [])
        .filter((e) => e.id && e.start && e.end)
        .map((event) => {
          const allDay = !!event.start?.date;
          const start = event.start?.dateTime || event.start?.date;
          const end = event.end?.dateTime || event.end?.date;

          return {
            google_event_id: event.id!,
            status: event.status ?? null,
            summary: event.summary ?? null,
            description: event.description ?? null,
            location: event.location ?? null,
            starts_at: start ? new Date(start).toISOString() : new Date().toISOString(),
            ends_at: end ? new Date(end).toISOString() : new Date().toISOString(),
            all_day: allDay,
            html_link: event.htmlLink ?? null,
            organizer_email: event.organizer?.email ?? null,
            updated_at_google: event.updated ? new Date(event.updated).toISOString() : null,
            raw: event,
          };
        });

      await replaceEventsForSource(source.id, mappedEvents);
      totalEvents += mappedEvents.length;
    }

    return NextResponse.json({ ok: true, calendars: list.length, events: totalEvents });
  } catch (error) {
    console.error("google sync:", error);
    return NextResponse.json({ error: "Failed to sync Google Calendar" }, { status: 500 });
  }
}
