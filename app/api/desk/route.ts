import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emptyDesk, validDesk, type CloudDesk } from "@/lib/desk/state";

const KEY = "desk_workspace_v1";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

async function read() {
  const db = await createClient();
  const { data, error } = await db.from("app_settings").select("value").eq("key", KEY).maybeSingle();
  if (error) throw error;
  if (!data) return { db, raw: null, state: { revision: null, data: emptyDesk } as CloudDesk };
  const state = JSON.parse(data.value) as CloudDesk;
  if (typeof state.revision !== "string" || !validDesk(state.data)) throw new Error("Invalid stored desk");
  return { db, raw: data.value as string, state };
}

export async function GET() {
  try { return NextResponse.json((await read()).state, { headers }); }
  catch { return NextResponse.json({ error: "Could not load your desk. Your local copy is safe." }, { status: 503, headers }); }
}

export async function PUT(request: NextRequest) {
  // The existing site-password middleware protects this route. Writes must also
  // originate from this site, just like a normal interaction with the Desk.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers });
  try {
    const rawBody = await request.text();
    if (rawBody.length > 1_000_000) return NextResponse.json({ error: "Your desk is too large to save." }, { status: 413, headers });
    let body: CloudDesk;
    try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid desk" }, { status: 400, headers }); }
    if (!body || (body.revision !== null && typeof body.revision !== "string") || !validDesk(body.data)) return NextResponse.json({ error: "Invalid desk" }, { status: 400, headers });
    const { db, raw, state } = await read();
    if (body.revision !== state.revision) return NextResponse.json(state, { status: 409, headers });
    const next: CloudDesk = { revision: crypto.randomUUID(), data: body.data };
    const row = { key: KEY, value: JSON.stringify(next), updated_at: new Date().toISOString() };
    if (raw === null) {
      const { error } = await db.from("app_settings").insert(row);
      if (error?.code === "23505") return NextResponse.json((await read()).state, { status: 409, headers });
      if (error) throw error;
    } else {
      // Compare-and-swap prevents a stale device from replacing a newer save.
      const { data, error } = await db.from("app_settings").update(row).eq("key", KEY).eq("value", raw).select("key");
      if (error) throw error;
      if (!data?.length) return NextResponse.json((await read()).state, { status: 409, headers });
    }
    return NextResponse.json(next, { headers });
  } catch { return NextResponse.json({ error: "Could not save online. Your local copy is safe; we’ll retry." }, { status: 503, headers }); }
}
