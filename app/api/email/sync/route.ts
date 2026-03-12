import { NextResponse } from "next/server";
import { getValidGmailToken, listInboxMessages } from "@/lib/gmail";
import { upsertEmails, getAllEmails } from "@/lib/db/emails";
import { getSetting } from "@/lib/db/settings";

export async function POST() {
  const token = await getValidGmailToken();
  if (!token) {
    return NextResponse.json({ error: "Not connected to Gmail" }, { status: 401 });
  }

  try {
    const limitStr = await getSetting("email_sync_limit");
    const limit = parseInt(limitStr ?? "100", 10) || 100;

    const messages = await listInboxMessages(token, limit);
    const newCount = await upsertEmails(messages);

    // Return fresh email list so client can update state without a page reload
    const emails = await getAllEmails();
    return NextResponse.json({ synced: newCount, total: messages.length, emails });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("Email sync error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
