import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db/settings";

/** GET: Fetch current tone profile and style note */
export async function GET() {
  const [toneProfile, styleNote, sampleCount] = await Promise.all([
    getSetting("gmail_tone_profile"),
    getSetting("gmail_style_note"),
    getSetting("gmail_tone_sample_count"),
  ]);

  return NextResponse.json({
    toneProfile,
    styleNote,
    sampleCount: sampleCount ? parseInt(sampleCount) : 0,
  });
}

/** POST: Save manual style note */
export async function POST(req: NextRequest) {
  const body = await req.json();
  await setSetting("gmail_style_note", body.styleNote ?? "");
  return NextResponse.json({ success: true });
}

/** DELETE: Clear tone profile (force re-analysis) */
export async function DELETE() {
  const supabase = (await import("@/lib/supabase/server")).createClient;
  const db = await supabase();
  await db
    .from("app_settings")
    .delete()
    .in("key", ["gmail_tone_profile", "gmail_tone_sample_count"]);

  return NextResponse.json({ success: true });
}
