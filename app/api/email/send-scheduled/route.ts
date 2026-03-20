/**
 * POST /api/email/send-scheduled
 *
 * Checks the `scheduled_emails` app_setting for any emails whose scheduledAt
 * is now in the past and sends them via Gmail. Called by the email client on
 * an interval (every 60 s) while the page is open.
 */
import { NextResponse } from "next/server";
import { getValidGmailToken, sendGmailReply, getGmailSignature } from "@/lib/gmail";
import { getSetting, setSetting } from "@/lib/db/settings";

interface ScheduledEmail {
  id: string;
  to: string;
  cc?: string[];
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  isHtml: boolean;
  scheduledAt: string;
  attachments?: Array<{ filename: string; mimeType: string; data: string }>;
}

export async function POST() {
  const token = await getValidGmailToken();
  if (!token) {
    return NextResponse.json({ sent: 0, error: "Not connected to Gmail" });
  }

  let scheduled: ScheduledEmail[] = [];
  try {
    const raw = await getSetting("scheduled_emails");
    scheduled = raw ? (JSON.parse(raw) as ScheduledEmail[]) : [];
  } catch {
    return NextResponse.json({ sent: 0 });
  }

  const now = Date.now();
  const due = scheduled.filter((e) => new Date(e.scheduledAt).getTime() <= now);
  if (!due.length) return NextResponse.json({ sent: 0 });

  const [userEmail, signature] = await Promise.all([
    getSetting("gmail_user_email").then((v) => v ?? "me"),
    getGmailSignature(token),
  ]);

  let sent = 0;
  const sentIds: string[] = [];

  for (const email of due) {
    try {
      let finalBody = email.body;
      let finalIsHtml = email.isHtml;

      if (signature) {
        finalIsHtml = true;
        const htmlBody = email.isHtml
          ? email.body
          : email.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
        finalBody = `<div>${htmlBody}</div><br><div class="gmail_signature_prefix">--</div>${signature}`;
      }

      await sendGmailReply(token, {
        to: email.to,
        cc: email.cc,
        subject: email.subject,
        body: finalBody,
        threadId: email.threadId,
        inReplyTo: email.inReplyTo,
        references: email.references,
        fromEmail: userEmail,
        isHtml: finalIsHtml,
        attachments: email.attachments ?? [],
      });

      sentIds.push(email.id);
      sent++;
    } catch (err) {
      console.error(`Failed to send scheduled email ${email.id}:`, err);
    }
  }

  // Remove successfully sent emails from the list
  if (sentIds.length) {
    const remaining = scheduled.filter((e) => !sentIds.includes(e.id));
    await setSetting("scheduled_emails", JSON.stringify(remaining));
  }

  return NextResponse.json({ sent, sentIds });
}
