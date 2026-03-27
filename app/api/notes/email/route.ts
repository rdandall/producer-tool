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
    const to = requireEmailList(body.to, "to", { required: true, maxItems: 25 });
    const subject = requireString(body.subject, "subject", { required: false, maxLength: 300 });
    const content = requireString(body.content, "content", { required: true, maxLength: 25000 });
    const title = requireString(body.title, "title", { required: false, maxLength: 240 }) ?? "Document";
    const personalNote = requireString(body.personalNote, "personalNote", { required: false, maxLength: 2000 }) ?? "";

    const links = Array.isArray(body.links)
      ? body.links.filter((l) => l && typeof l === "object") as Array<{ label: string; url: string }>
      : [];

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "RESEND_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const bodyHtml = renderMarkdownForEmail(content);
    const today = plainTextToHtml(
      new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    );
    const linksHtml = safeLinksHtml(links);
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
  </div>

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;text-align:center;">
    <p style="font-size:11px;color:#aaa;margin:0;">Sent via PRDCR &middot; ${today}</p>
  </div>
</body>
</html>`;

    const emailSubject = subject?.trim() || `PRDCR: ${title}`;
    const fromAddress = (await getSetting("email_from_address")) ?? process.env.RESEND_FROM_EMAIL ?? "PRDCR <noreply@prdcr.co>";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to,
        subject: emailSubject,
        html: emailHtml,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message ?? "Failed to send email");
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
