import { NextRequest, NextResponse } from "next/server";
import { getValidGmailToken, sendGmailReply } from "@/lib/gmail";
import { getSetting } from "@/lib/db/settings";

export async function POST(req: NextRequest) {
  const token = await getValidGmailToken();
  if (!token) {
    return NextResponse.json({ error: "Not connected to Gmail" }, { status: 401 });
  }

  const body = await req.json();
  const { to, subject, emailBody, threadId, inReplyTo, references } = body;

  if (!to || !emailBody || !threadId) {
    return NextResponse.json({ error: "Missing required fields: to, emailBody, threadId" }, { status: 400 });
  }

  try {
    const userEmail = (await getSetting("gmail_user_email")) ?? "me";

    await sendGmailReply(token, {
      to,
      subject: subject ?? "",
      body: emailBody,
      threadId,
      inReplyTo,
      references,
      fromEmail: userEmail,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Send failed";
    console.error("Email send error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
