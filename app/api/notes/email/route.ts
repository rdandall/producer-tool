import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/db/settings";
import {
  escapeHtml,
  sanitizeUrl,
  plainTextToHtml,
  renderMarkdownForEmail,
} from "@/lib/markdown";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody, requireString, requireEmailList, ValidationError } from "@/lib/validation";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "note-attachments";
const EMAIL_ATTACHMENT_LIMIT_BYTES = 8 * 1024 * 1024; // 8 MB total before falling back to links

function safeLinksHtml(links: Array<{ label: string; url: string }> | undefined) {
  if (!Array.isArray(links) || links.length === 0) return "";
  return `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;">\
          <h2 style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#555;margin:0 0 8px 0;">Links &amp; References</h2>\
          <ul style="padding-left:18px;margin:0;">\
            ${links
              .filter((link) => {
                if (!link || typeof link !== "object") return false;
                return typeof link.url === "string" && link.url.trim().length > 0;
              })
              .map((link) => {
                const href = sanitizeUrl((link as { url: string }).url);
                const label = escapeHtml((link as { label?: string }).label || href);
                return `<li style="margin-bottom:4px;"><a href="${href}" style="color:#2563eb;">${label}</a></li>`;
              })
              .join("")}\
          </ul>\
        </div>`;
}

function attachmentLinksHtml(
  attachments: Array<{ filename: string; signedUrl: string }>
) {
  if (attachments.length === 0) return "";
  return `<div style="margin-top:20px;padding-top:16px;border-top:1px solid #eee;">\
    <h2 style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#555;margin:0 0 8px 0;">Attachments</h2>\
    <ul style="padding-left:18px;margin:0;">\
      ${attachments
        .map(
          (a) =>
            `<li style="margin-bottom:4px;"><a href="${escapeHtml(a.signedUrl)}" style="color:#2563eb;">${escapeHtml(a.filename)}</a></li>`
        )
        .join("")}\
    </ul>\
    <p style="font-size:10px;color:#aaa;margin:6px 0 0 0;">Links expire in 7 days.</p>\
  </div>`;
}

export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(req, "notes.email", 20, 60_000);
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rate.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
      );
    }

    const body = await parseJsonBody(req);
    const to           = requireEmailList(body.to, "to", { required: true, maxItems: 25 });
    const subject      = requireString(body.subject, "subject", { required: false, maxLength: 300 });
    const content      = requireString(body.content, "content", { required: true, maxLength: 25000 }) ?? "";
    const title        = requireString(body.title, "title", { required: false, maxLength: 240 }) ?? "Document";
    const personalNote = requireString(body.personalNote, "personalNote", { required: false, maxLength: 2000 }) ?? "";
    const noteId       = requireString(body.noteId, "noteId", { required: false, maxLength: 36 }) ?? "";

    const links = Array.isArray(body.links)
      ? (body.links.filter((l) => l && typeof l === "object") as Array<{ label: string; url: string }>)
      : [];

    // Attachment IDs explicitly selected for delivery (optional)
    const attachmentIds: string[] = Array.isArray(body.attachmentIds)
      ? body.attachmentIds.filter((id): id is string => typeof id === "string")
      : [];

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "RESEND_API_KEY is not configured" },
        { status: 500 }
      );
    }

    // ── Resolve attachments ───────────────────────────────────────────────
    type ResendAttachment = { filename: string; content: string }; // base64
    const resendAttachments: ResendAttachment[] = [];
    const fallbackLinks: Array<{ filename: string; signedUrl: string }> = [];

    if (attachmentIds.length > 0 && noteId) {
      const supabase = await createClient();

      // Fetch delivery/both role attachments for this note
      const { data: attachments } = await supabase
        .from("note_attachments")
        .select("*")
        .eq("note_id", noteId)
        .in("role", ["delivery", "both"])
        .in("id", attachmentIds);

      let totalSize = 0;

      for (const att of attachments ?? []) {
        totalSize += att.size_bytes;

        if (totalSize > EMAIL_ATTACHMENT_LIMIT_BYTES) {
          // Size budget exceeded — fall back to signed link for this and all remaining
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(att.storage_path, 7 * 24 * 3600); // 7 days
          if (signed?.signedUrl) {
            fallbackLinks.push({ filename: att.filename, signedUrl: signed.signedUrl });
          }
          continue;
        }

        // Try to download and attach inline
        const { data: fileData, error: dlError } = await supabase.storage
          .from(BUCKET)
          .download(att.storage_path);

        if (dlError || !fileData) {
          // Fall back to link
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(att.storage_path, 7 * 24 * 3600);
          if (signed?.signedUrl) {
            fallbackLinks.push({ filename: att.filename, signedUrl: signed.signedUrl });
          }
          continue;
        }

        const buffer = Buffer.from(await fileData.arrayBuffer());
        resendAttachments.push({
          filename: att.filename,
          content: buffer.toString("base64"),
        });
      }
    }

    // ── Build email HTML ──────────────────────────────────────────────────
    const bodyHtml = renderMarkdownForEmail(content);
    const today = plainTextToHtml(
      new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    );
    const linksHtml      = safeLinksHtml(links);
    const fallbackHtml   = attachmentLinksHtml(fallbackLinks);
    const personalNoteHtml = personalNote
      ? `<div style="margin-bottom:24px;padding:12px 16px;background:#f8f9fa;border-left:3px solid #2563eb;">\
          <p style="margin:0;color:#444;font-style:italic;">${plainTextToHtml(personalNote)}</p>\
        </div>`
      : "";

    const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Georgia,'Times New Roman',serif;max-width:640px;margin:0 auto;padding:32px 24px;background:#ffffff;">
  <div style="margin-bottom:32px;">
    <span style="font-weight:900;font-size:16px;letter-spacing:-0.04em;color:#111;">PRDCR</span>
  </div>

  ${personalNoteHtml}

  <div style="padding:24px 0;border-top:1px solid #eee;">
    ${bodyHtml}
    ${linksHtml}
    ${fallbackHtml}
  </div>

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;text-align:center;">
    <p style="font-size:11px;color:#aaa;margin:0;">Sent via PRDCR &middot; ${today}</p>
  </div>
</body>
</html>`;

    const emailSubject = subject?.trim() || `PRDCR: ${title}`;
    const fromAddress =
      (await getSetting("email_from_address")) ??
      process.env.RESEND_FROM_EMAIL ??
      "PRDCR <noreply@prdcr.co>";

    const resendPayload: Record<string, unknown> = {
      from:    fromAddress,
      to,
      subject: emailSubject,
      html:    emailHtml,
    };

    if (resendAttachments.length > 0) {
      resendPayload.attachments = resendAttachments;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendPayload),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error((err as { message?: string }).message ?? "Failed to send email");
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const status = err instanceof ValidationError ? err.statusCode : 500;
    console.error("notes/email error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Email failed" },
      { status }
    );
  }
}
