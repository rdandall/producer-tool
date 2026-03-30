import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { syncInboxEmails } from "@/lib/email-sync";

export async function POST() {
  const rate = checkRateLimit(new Request("/api/email/sync"), "email.sync", 20, 60_000);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfter: rate.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  try {
    const result = await syncInboxEmails();
    return NextResponse.json(result, { status: result.syncErrors.length > 0 ? 207 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    const status = message.includes("Not connected") ? 401 : 500;
    console.error("Email sync error:", err);
    return NextResponse.json({ error: message }, { status });
  }
}
