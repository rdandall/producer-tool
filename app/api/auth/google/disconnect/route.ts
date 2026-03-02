import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** DELETE Google Calendar tokens, effectively disconnecting the integration. */
export async function POST() {
  const supabase = await createClient();
  await supabase
    .from("app_settings")
    .delete()
    .in("key", ["google_refresh_token", "google_access_token", "google_token_expiry"]);

  return NextResponse.json({ success: true });
}
