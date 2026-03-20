import { NextRequest, NextResponse } from "next/server";
import { getValidGmailToken, sendGmailReply, getGmailSignature } from "@/lib/gmail";
import { getSetting, setSetting } from "@/lib/db/settings";

// ── Scheduled send helpers ─────────────────────────────────────────────────────

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
  scheduledAt: string; // ISO string
  attachments?: Array<{ filename: string; mimeType: string; data: string }>;
}

async function getScheduledEmails(): Promise<ScheduledEmail[]> {
  try {
    const raw = await getSetting("scheduled_emails");
    return raw ? (JSON.parse(raw) as ScheduledEmail[]) : [];
  } catch {
    return [];
  }
}

async function saveScheduledEmails(emails: ScheduledEmail[]): Promise<void> {
  await setSetting("scheduled_emails", JSON.stringify(emails));
}

// ── GET — return pending scheduled emails ─────────────────────────────────────

export async function GET() {
  const scheduled = await getScheduledEmails();
  return NextResponse.json({ scheduled });
}

// ── DELETE — remove a scheduled email by id ───────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const scheduled = await getScheduledEmails();
  await saveScheduledEmails(scheduled.filter((e) => e.id !== id));
  return NextResponse.json({ success: true });
}

// ── POST — send immediately OR save as scheduled ──────────────────────────────

export async function POST(req: NextRequest) {
  const token = await getValidGmailToken();
  if (!token) {
    return NextResponse.json({ error: "Not connected to Gmail" }, { status: 401 });
  }

  const body = await req.json();
  const { to, cc, subject, emailBody, threadId, inReplyTo, references, isHtml, attachments, scheduledAt } = body;

  if (!to || !emailBody) {
    return NextResponse.json({ error: "Missing required fields: to, emailBody" }, { status: 400 });
  }

  // ── Scheduled: save for later ──────────────────────────────────────────────
  if (scheduledAt) {
    const scheduled = await getScheduledEmails();
    const newEntry: ScheduledEmail = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      to,
      cc: Array.isArray(cc) ? cc : undefined,
      subject: subject ?? "",
      body: emailBody,
      threadId,
      inReplyTo,
      references,
      isHtml: !!isHtml,
      scheduledAt,
      attachments: attachments ?? [],
    };
    scheduled.push(newEntry);
    await saveScheduledEmails(scheduled);
    return NextResponse.json({ success: true, scheduled: true, id: newEntry.id });
  }

  // ── Send immediately ────────────────────────────────────────────────────────
  try {
    const [userEmail, signature] = await Promise.all([
      getSetting("gmail_user_email").then((v) => v ?? "me"),
      getGmailSignature(token),
    ]);

    // Inject signature — always send as HTML when a signature exists
    let finalBody = emailBody;
    let finalIsHtml = !!isHtml;

    if (signature) {
      finalIsHtml = true;
      // Convert plain-text body to HTML so it renders correctly alongside an HTML sig
      const htmlBody = isHtml
        ? emailBody
        : emailBody.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
      finalBody = `<div>${htmlBody}</div><br><div class="gmail_signature_prefix">--</div>${signature}`;
    }

    await sendGmailReply(token, {
      to,
      cc: Array.isArray(cc) ? cc : undefined,
      subject: subject ?? "",
      body: finalBody,
      threadId,
      inReplyTo,
      references,
      fromEmail: userEmail,
      isHtml: finalIsHtml,
      attachments: attachments ?? [],
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Send failed";
    console.error("Email send error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
