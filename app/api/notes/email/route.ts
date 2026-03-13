import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/db/settings";

function markdownToHtmlEmail(markdown: string): string {
  let html = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const lines = html.split("\n");
  const output: string[] = [];
  let inList = false;

  for (const line of lines) {
    if (line.startsWith("# ")) {
      if (inList) { output.push("</ul>"); inList = false; }
      output.push(`<h1 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px 0;padding-bottom:8px;border-bottom:2px solid #111;">${line.slice(2)}</h1>`);
    } else if (line.startsWith("## ")) {
      if (inList) { output.push("</ul>"); inList = false; }
      output.push(`<h2 style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#555;margin:24px 0 6px 0;">${line.slice(3)}</h2>`);
    } else if (line.startsWith("### ")) {
      if (inList) { output.push("</ul>"); inList = false; }
      output.push(`<h3 style="font-size:13px;font-weight:700;color:#333;margin:16px 0 4px 0;">${line.slice(4)}</h3>`);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) { output.push(`<ul style="padding-left:18px;margin:6px 0;">`); inList = true; }
      output.push(`<li style="margin-bottom:3px;color:#333;">${formatInlineEmail(line.slice(2))}</li>`);
    } else if (line.trim() === "") {
      if (inList) { output.push("</ul>"); inList = false; }
      output.push(`<br>`);
    } else if (line === "---") {
      if (inList) { output.push("</ul>"); inList = false; }
      output.push(`<hr style="border:none;border-top:1px solid #eee;margin:16px 0;">`);
    } else {
      if (inList) { output.push("</ul>"); inList = false; }
      output.push(`<p style="margin:0 0 10px 0;color:#333;line-height:1.6;">${formatInlineEmail(line)}</p>`);
    }
  }

  if (inList) output.push("</ul>");
  return output.join("\n");
}

function formatInlineEmail(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>");
}

export async function POST(req: NextRequest) {
  try {
    const { to, subject, content, title, links, personalNote } = await req.json();

    if (!to || !content) {
      return NextResponse.json(
        { error: "Recipient email and content are required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "RESEND_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const bodyHtml = markdownToHtmlEmail(content);
    const today = new Date().toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
    });

    const linksHtml = links?.length
      ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;">
          <h2 style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#555;margin:0 0 8px 0;">Links &amp; References</h2>
          <ul style="padding-left:18px;margin:0;">
            ${links.map((l: { label: string; url: string }) =>
              `<li style="margin-bottom:4px;"><a href="${l.url}" style="color:#2563eb;">${l.label || l.url}</a></li>`
            ).join("")}
          </ul>
        </div>`
      : "";

    const personalNoteHtml = personalNote?.trim()
      ? `<div style="margin-bottom:24px;padding:12px 16px;background:#f8f9fa;border-left:3px solid #2563eb;">
          <p style="margin:0;color:#444;font-style:italic;">${personalNote}</p>
        </div>`
      : "";

    const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Georgia,'Times New Roman',serif;max-width:640px;margin:0 auto;padding:32px 24px;background:#ffffff;">
  <!-- Header -->
  <div style="margin-bottom:32px;">
    <span style="font-weight:900;font-size:16px;letter-spacing:-0.04em;color:#111;">PRDCR</span>
  </div>

  ${personalNoteHtml}

  <!-- Document -->
  <div style="padding:24px 0;border-top:1px solid #eee;">
    ${bodyHtml}
    ${linksHtml}
  </div>

  <!-- Footer -->
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;text-align:center;">
    <p style="font-size:11px;color:#aaa;margin:0;">Sent via PRDCR &middot; ${today}</p>
  </div>
</body>
</html>`;

    const emailSubject = subject?.trim() || (title ? `PRDCR: ${title}` : "Document from PRDCR");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: await getSetting("email_from_address") ?? process.env.RESEND_FROM_EMAIL ?? "PRDCR <noreply@prdcr.co>",
        to: Array.isArray(to) ? to : [to],
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
    console.error("notes/email error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Email failed" },
      { status: 500 }
    );
  }
}
