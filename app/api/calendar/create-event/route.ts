import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db/settings";
import { refreshGoogleToken, createGoogleCalendarEvent } from "@/lib/google-calendar";

export async function POST(req: NextRequest) {
  try {
    const { summary, description, location, startDateTime, endDateTime, timeZone, allDay, startDate, endDate } =
      await req.json();

    if (!summary) {
      return NextResponse.json({ error: "Event title is required" }, { status: 400 });
    }

    const refreshToken = await getSetting("google_refresh_token");
    if (!refreshToken) {
      return NextResponse.json({ error: "Google Calendar not connected" }, { status: 401 });
    }

    // Get a valid access token (refresh if expired)
    let accessToken = await getSetting("google_access_token");
    const expiryStr = await getSetting("google_token_expiry");
    const expired = !expiryStr || Date.now() > parseInt(expiryStr) - 60_000;

    if (!accessToken || expired) {
      accessToken = await refreshGoogleToken(refreshToken);
      await setSetting("google_access_token", accessToken);
      await setSetting("google_token_expiry", String(Date.now() + 3600 * 1000));
    }

    const result = await createGoogleCalendarEvent(accessToken, {
      summary,
      description,
      location,
      startDateTime,
      endDateTime,
      timeZone,
      allDay,
      startDate,
      endDate,
    });

    return NextResponse.json({ success: true, id: result.id, htmlLink: result.htmlLink });
  } catch (err) {
    console.error("create-event error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create event" },
      { status: 500 }
    );
  }
}
