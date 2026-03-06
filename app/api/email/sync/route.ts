import { NextResponse } from "next/server";
import { getValidGmailToken, listInboxMessages } from "@/lib/gmail";
import { upsertEmails } from "@/lib/db/emails";

export async function POST() {
  const token = await getValidGmailToken();
  if (!token) {
    return NextResponse.json({ error: "Not connected to Gmail" }, { status: 401 });
  }

  try {
    const messages = await listInboxMessages(token, 50);
    await upsertEmails(messages);
    return NextResponse.json({ synced: messages.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("Email sync error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
