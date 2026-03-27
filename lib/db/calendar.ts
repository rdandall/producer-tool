import { createClient } from "@/lib/supabase/server";

export interface GoogleConnection {
  id: string;
  provider: string;
  access_token: string;
  refresh_token: string | null;
  expiry_date: string | null;
  scope: string | null;
  token_type: string | null;
  email: string | null;
  updated_at?: string;
}

export interface CalendarSource {
  id: string;
  google_calendar_id: string;
  summary: string | null;
  timezone: string | null;
  primary_calendar: boolean;
  selected: boolean;
}

export interface CalendarEvent {
  id: string;
  source_id: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  status: string | null;
  html_link: string | null;
  source?: { summary: string | null; google_calendar_id: string };
}

export async function getGoogleConnection(): Promise<GoogleConnection | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("google_calendar_connections")
    .select("*")
    .eq("provider", "google")
    .maybeSingle();

  if (error) {
    console.error("getGoogleConnection:", error.message);
    return null;
  }

  return data;
}

export async function upsertGoogleConnection(payload: {
  access_token: string;
  refresh_token?: string | null;
  expiry_date?: string | null;
  scope?: string | null;
  token_type?: string | null;
  email?: string | null;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("google_calendar_connections")
    .upsert(
      {
        provider: "google",
        ...payload,
      },
      { onConflict: "provider" }
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function disconnectGoogleCalendar() {
  const supabase = await createClient();

  const { error: eventsError } = await supabase.from("calendar_events").delete().not("id", "is", null);
  if (eventsError) throw new Error(eventsError.message);

  const { error: sourceError } = await supabase.from("calendar_sources").delete().not("id", "is", null);

  if (sourceError) throw new Error(sourceError.message);

  const { error: connError } = await supabase
    .from("google_calendar_connections")
    .delete()
    .eq("provider", "google");

  if (connError) throw new Error(connError.message);
}

export async function upsertCalendarSource(payload: {
  google_calendar_id: string;
  summary: string | null;
  timezone: string | null;
  primary_calendar: boolean;
  selected?: boolean;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("calendar_sources")
    .upsert(
      {
        ...payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "google_calendar_id" }
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as CalendarSource;
}

export async function replaceEventsForSource(sourceId: string, events: Array<{
  google_event_id: string;
  status: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  html_link: string | null;
  organizer_email: string | null;
  updated_at_google: string | null;
  raw: unknown;
}>) {
  const supabase = await createClient();
  const remoteIds = events.map((event) => event.google_event_id);
  if (!events.length) {
    const { error: deleteError } = await supabase
      .from("calendar_events")
      .delete()
      .eq("source_id", sourceId);
    if (deleteError) throw new Error(deleteError.message);
    return;
  }

  const { error: upsertError } = await supabase
    .from("calendar_events")
    .upsert(
      events.map((e) => ({
        ...e,
        source_id: sourceId,
      })),
      { onConflict: "source_id,google_event_id" }
    );

  if (upsertError) throw new Error(upsertError.message);

  const { error: removeError } = await supabase
    .from("calendar_events")
    .delete()
    .eq("source_id", sourceId)
    .not("google_event_id", "in", `(${remoteIds.map((id) => `'${id.replace(/'/g, \"''\")}'`).join(",") || "''"})`);

  if (removeError) throw new Error(removeError.message);
}

export async function getCalendarPageData() {
  const supabase = await createClient();

  const [connRes, sourceRes, eventRes] = await Promise.all([
    supabase
      .from("google_calendar_connections")
      .select("provider, email, updated_at")
      .eq("provider", "google")
      .maybeSingle(),
    supabase
      .from("calendar_sources")
      .select("id, google_calendar_id, summary, timezone, primary_calendar, selected")
      .order("primary_calendar", { ascending: false })
      .order("summary", { ascending: true }),
    supabase
      .from("calendar_events")
      .select(`
        id, source_id, summary, description, location, starts_at, ends_at,
        all_day, status, html_link,
        source:calendar_sources(summary, google_calendar_id)
      `)
      .gte("ends_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("starts_at", { ascending: true })
      .limit(300),
  ]);

  if (connRes.error) console.error("calendar conn:", connRes.error.message);
  if (sourceRes.error) console.error("calendar sources:", sourceRes.error.message);
  if (eventRes.error) console.error("calendar events:", eventRes.error.message);

  const normalizedEvents = (eventRes.data ?? []).map((event) => {
    const source = Array.isArray(event.source) ? event.source[0] : event.source;
    return {
      ...event,
      source: source
        ? {
            summary: source.summary,
            google_calendar_id: source.google_calendar_id,
          }
        : undefined,
    };
  }) as CalendarEvent[];

  return {
    connection: connRes.data,
    sources: (sourceRes.data ?? []) as CalendarSource[],
    events: normalizedEvents,
  };
}
