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
import { plainTextToHtml } from "@/lib/markdown";
import { checkRateLimit } from "@/lib/rate-limit";

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

function parseScheduledEmails(raw: string | null): ScheduledEmail[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

export async function POST() {
  const rate = checkRateLimit(new Request("/api/email/send-scheduled"), "email.send-scheduled", 20, 60_000);
  if (!rate.ok) {
    return NextResponse.json({ sent: 0, error: "Rate limit exceeded" }, { status: 429 });
  }

  const token = await getValidGmailToken();
  if (!token) {
    return NextResponse.json({ sent: 0, error: "Not connected to Gmail" });
  }

  let scheduled: ScheduledEmail[] = [];
  try {
    const raw = await getSetting("scheduled_emails");
    scheduled = parseScheduledEmails(raw);
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
          : plainTextToHtml(email.body);
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

  if (sentIds.length) {
    const remaining = scheduled.filter((e) => !sentIds.includes(e.id));
    await setSetting("scheduled_emails", JSON.stringify(remaining));
  }

  return NextResponse.json({ sent, sentIds });
}
