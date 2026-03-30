import { NextRequest, NextResponse } from "next/server";
import {
  getValidGmailToken,
  sendGmailReply,
  getGmailSignature,
} from "@/lib/gmail";
import { getSetting, setSetting } from "@/lib/db/settings";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  parseJsonBody,
  requireString,
  requireEmailList,
  optionalDateIso,
  ValidationError,
} from "@/lib/validation";
import { plainTextToHtml } from "@/lib/markdown";

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

export async function GET(req: NextRequest) {
  const rate = checkRateLimit(req, "email.send.get", 120, 60_000);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfter: rate.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }
  const scheduled = await getScheduledEmails();
  return NextResponse.json({ scheduled });
}

export async function DELETE(req: NextRequest) {
  try {
    const rate = checkRateLimit(req, "email.send.delete", 30, 60_000);
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rate.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
      );
    }

    const body = await parseJsonBody(req);
    const id = requireString(body.id, "id", { required: true, maxLength: 64 });
    const scheduled = await getScheduledEmails();
    await saveScheduledEmails(scheduled.filter((e) => e.id !== id));
    return NextResponse.json({ success: true });
  } catch (err) {
    const status = err instanceof ValidationError ? err.statusCode : 500;
    console.error("schedule delete error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete" }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(req, "email.send", 40, 60_000);
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

    const body = await parseJsonBody(req);
    const to = requireEmailList(body.to, "to", { required: true, maxItems: 25 });
    const cc = body.cc === undefined ? undefined : requireEmailList(body.cc, "cc", { required: false, maxItems: 25 });
    const subject = requireString(body.subject, "subject", { required: false, maxLength: 300 }) || "";
    const emailBody =
      requireString(body.emailBody, "emailBody", { required: true, maxLength: 100000 }) ?? "";
    const scheduledAt = optionalDateIso(body.scheduledAt, "scheduledAt");

    const threadId = requireString(body.threadId, "threadId", { required: false, maxLength: 200 }) ?? undefined;
    const inReplyTo = requireString(body.inReplyTo, "inReplyTo", { required: false, maxLength: 300 }) ?? undefined;
    const references = requireString(body.references, "references", { required: false, maxLength: 5000 }) ?? undefined;
    const isHtml = body.isHtml === true;
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (scheduledAt) {
      const at = new Date(scheduledAt).getTime();
      if (Number.isNaN(at) || at < Date.now()) {
        return NextResponse.json({ error: "scheduledAt must be a future date" }, { status: 400 });
      }

      const scheduled = await getScheduledEmails();
      const newEntry: ScheduledEmail = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        to: to.join(","),
        cc,
        subject,
        body: emailBody,
        threadId,
        inReplyTo,
        references,
        isHtml,
        scheduledAt,
        attachments,
      };
      scheduled.push(newEntry);
      await saveScheduledEmails(scheduled);
      return NextResponse.json({ success: true, scheduled: true, id: newEntry.id });
    }

    const [userEmail, signature] = await Promise.all([
      getSetting("gmail_user_email").then((v) => v ?? "me"),
      getGmailSignature(token),
    ]);

    let finalBody: string = emailBody;
    let finalIsHtml = isHtml;

    if (signature) {
      finalIsHtml = true;
      const htmlBody = isHtml ? emailBody : plainTextToHtml(emailBody);
      finalBody = `<div>${htmlBody}</div><br><div class="gmail_signature_prefix">--</div>${signature}`;
    }

    const payload = {
      to: to.join(","),
      cc,
      subject,
      body: finalBody,
      threadId,
      inReplyTo,
      references,
      fromEmail: userEmail,
      isHtml: finalIsHtml,
      attachments: attachments ?? [],
    };

    await sendGmailReply(token, payload);
    return NextResponse.json({ success: true });
  } catch (err) {
    const status = err instanceof ValidationError ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : "Send failed";
    console.error("Email send error:", err);
    return NextResponse.json({ error: message }, { status });
  }
}
