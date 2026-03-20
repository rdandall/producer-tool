import { NextResponse } from "next/server";
import { getValidGmailToken, listInboxMessages } from "@/lib/gmail";
import { upsertEmails, getAllEmails, getPendingTaskSuggestions } from "@/lib/db/emails";

export async function POST() {
  const token = await getValidGmailToken();
  if (!token) {
    return NextResponse.json({ error: "Not connected to Gmail" }, { status: 401 });
  }

  try {
    const messages = await listInboxMessages(token, 100);
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("Email sync error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
