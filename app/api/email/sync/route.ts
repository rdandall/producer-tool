import { NextResponse } from "next/server";
import { getValidGmailToken, listInboxMessages } from "@/lib/gmail";
import { upsertEmails, getAllEmails, getPendingTaskSuggestions } from "@/lib/db/emails";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST() {
  const rate = checkRateLimit(new Request("/api/email/sync"), "email.sync", 20, 60_000);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfter: rate.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  const token = await getValidGmailToken();
  if (!token) {
    return NextResponse.json({ error: "Not connected to Gmail" }, { status: 401 });
  }

  try {
    const messages = await listInboxMessages(token, 100);
    if (!messages.length) {
      const [emails, taskSuggestions] = await Promise.all([
        getAllEmails(),
        getPendingTaskSuggestions(),
      ]);
      return NextResponse.json({ synced: 0, total: 0, emails, taskSuggestions, syncErrors: [] });
    }

    try {
      const newCount = await upsertEmails(messages);
      const [emails, taskSuggestions] = await Promise.all([
        getAllEmails(),
        getPendingTaskSuggestions(),
      ]);

      return NextResponse.json({
        synced: newCount,
        total: messages.length,
        emails,
        taskSuggestions,
      });
    } catch (err) {
      const [emails, taskSuggestions] = await Promise.all([
        getAllEmails(),
        getPendingTaskSuggestions(),
      ]);
      return NextResponse.json({
        synced: 0,
        total: 0,
        emails,
        taskSuggestions,
        syncErrors: [{ type: "upsert", error: err instanceof Error ? err.message : "Sync failed" }],
      }, { status: 207 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("Email sync error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
