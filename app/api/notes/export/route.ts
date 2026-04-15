import { NextRequest, NextResponse } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from "docx";
import { ValidationError, parseJsonBody, requireString } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { renderSimpleMarkdownToHtml, sanitizeUrl, escapeHtml, plainTextToHtml } from "@/lib/markdown";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "note-attachments";

interface LinkInput {
  label: string;
  url: string;
}

interface AttachmentForExport {
  id:           string;
  filename:     string;
  mime_type:    string;
  storage_path: string;
  role:         string;
}

const MAX_CONTENT_LENGTH = 120000;
const MAX_TITLE_LENGTH   = 200;

function toSafeTitle(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_TITLE_LENGTH) : fallback;
}

function safeLinksForHtml(links: unknown): LinkInput[] {
  if (!Array.isArray(links)) return [];
  return links
    .map((link) => {
      if (!link || typeof link !== "object") return null;
      const label = typeof (link as { label?: unknown }).label === "string"
        ? (link as { label?: string }).label!
        : "";
      const url = typeof (link as { url?: unknown }).url === "string"
        ? (link as { url?: string }).url!
        : "";
      return { label: label.slice(0, 160).trim(), url: sanitizeUrl(url) };
    })
    .filter((l): l is LinkInput => !!l && !!l.url && l.url !== "#");
}

// ── Markdown → DOCX paragraphs ───────────────────────────────────────────────

function markdownToDocxParagraphs(markdown: string): Paragraph[] {
  const lines = markdown.split("\n");
  const paragraphs: Paragraph[] = [];

  for (const line of lines) {
    if (line.startsWith("# ")) {
      paragraphs.push(new Paragraph({
        text: line.slice(2),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }));
      continue;
    }
    if (line.startsWith("## ")) {
      paragraphs.push(new Paragraph({
        text: line.slice(3),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 120 },
      }));
      continue;
    }
    if (line.startsWith("### ")) {
      paragraphs.push(new Paragraph({
        text: line.slice(4),
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 80 },
      }));
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      paragraphs.push(new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: line.slice(2) })],
        spacing: { after: 60 },
      }));
      continue;
    }
    if (line.startsWith("*") && line.endsWith("*") && line.length > 2) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: line.slice(1, -1), italics: true })],
        spacing: { after: 60 },
      }));
      continue;
    }
    if (line === "---" || line === "***" || line === "___") {
      paragraphs.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" } },
        spacing: { before: 200, after: 200 },
      }));
      continue;
    }
    if (line.trim() === "") {
      paragraphs.push(new Paragraph({ text: "", spacing: { after: 80 } }));
      continue;
    }

    const hasBold = line.includes("**");
    if (hasBold) {
      const runs: TextRun[] = [];
      const parts = line.split(/(\*\*.*?\*\*)/);
      for (const part of parts) {
        if (part.startsWith("**") && part.endsWith("**")) {
          runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
        } else if (part) {
          runs.push(new TextRun({ text: part }));
        }
      }
      paragraphs.push(new Paragraph({ children: runs, spacing: { after: 80 } }));
      continue;
    }

    paragraphs.push(new Paragraph({
      children: [new TextRun({ text: line })],
      spacing: { after: 80 },
    }));
  }

  return paragraphs;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(req, "notes.export", 20, 60_000);
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rate.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
      );
    }

    const body      = await parseJsonBody(req);
    const content   = requireString(body.content, "content", { required: true, maxLength: MAX_CONTENT_LENGTH }) ?? "";
    const titleRaw  = body.title;
    const format    = body.format;
    const formatStr = typeof format === "string" ? format : "";
    const noteId    = typeof body.noteId === "string" ? body.noteId.trim() : "";

    if (!formatStr) return NextResponse.json({ error: "Missing format" }, { status: 400 });
    if (formatStr !== "pdf" && formatStr !== "docx")
      return NextResponse.json({ error: "Invalid format" }, { status: 400 });

    const title        = toSafeTitle(titleRaw, "Document");
    const safeFilename = title.replace(/[^a-z0-9]/gi, "-").toLowerCase() || "document";
    const links        = safeLinksForHtml(body.links);
    const generatedAt  = new Date().toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
    });

    // ── Resolve attachments from DB (delivery/both role) ─────────────────
    let exportAttachments: AttachmentForExport[] = [];
    if (noteId) {
      try {
        const supabase = await createClient();
        const { data } = await supabase
          .from("note_attachments")
          .select("id, filename, mime_type, storage_path, role")
          .eq("note_id", noteId)
          .in("role", ["delivery", "both"]);
        exportAttachments = data ?? [];
      } catch {
        // Non-fatal — proceed without attachments
      }
    }

    // Separate images (can embed) from other files (list as references)
    const imageAttachments = exportAttachments.filter((a) => a.mime_type.startsWith("image/"));
    const otherAttachments = exportAttachments.filter((a) => !a.mime_type.startsWith("image/"));

    // ── PDF export ───────────────────────────────────────────────────────────
    if (formatStr === "pdf") {
      const bodyHtml = renderSimpleMarkdownToHtml(content);

      // Embed images inline as base64 <img> tags
      let imagesHtml = "";
      if (imageAttachments.length > 0) {
        try {
          const supabase = await createClient();
          const imgTags: string[] = [];
          for (const att of imageAttachments) {
            const { data: fileData, error } = await supabase.storage
              .from(BUCKET)
              .download(att.storage_path);
            if (error || !fileData) continue;
            const buffer  = Buffer.from(await fileData.arrayBuffer());
            const base64  = buffer.toString("base64");
            const altText = escapeHtml(att.filename);
            imgTags.push(
              `<figure style="margin:16pt 0;"><img src="data:${att.mime_type};base64,${base64}" alt="${altText}" style="max-width:100%;height:auto;border:1px solid #eee;" /><figcaption style="font-size:8pt;color:#888;margin-top:4pt;">${altText}</figcaption></figure>`
            );
          }
          if (imgTags.length > 0) {
            imagesHtml = `<section class="attachments-images" style="margin-top:24pt;">${imgTags.join("")}</section>`;
          }
        } catch {
          // Skip image embedding on error
        }
      }

      // Other attachments → reference list with signed URLs (7-day expiry)
      let attachmentRefsHtml = "";
      if (otherAttachments.length > 0) {
        try {
          const supabase = await createClient();
          const items: string[] = [];
          for (const att of otherAttachments) {
            const { data: signed } = await supabase.storage
              .from(BUCKET)
              .createSignedUrl(att.storage_path, 7 * 24 * 3600);
            if (!signed?.signedUrl) continue;
            items.push(
              `<li><a href="${escapeHtml(signed.signedUrl)}">${escapeHtml(att.filename)}</a></li>`
            );
          }
          if (items.length > 0) {
            attachmentRefsHtml = `<section class="attachments" style="margin-top:24pt;padding-top:12pt;border-top:1px solid #eee;"><h2>Attachments</h2><ul>${items.join("")}</ul><p style="font-size:8pt;color:#aaa;">Links expire in 7 days.</p></section>`;
          }
        } catch {
          // Skip on error
        }
      }

      const linksHtml = links.length
        ? `<section class="links"><h2>Links &amp; References</h2><ul>${links
            .map((l) => `<li><a href="${l.url}">${l.label || l.url}</a></li>`)
            .join("")}</ul></section>`
        : "";

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 11pt;
      line-height: 1.7;
      color: #1a1a1a;
      max-width: 720px;
      margin: 0 auto;
      padding: 48pt 60pt;
    }
    h1 {
      font-size: 22pt; font-weight: 700; letter-spacing: -0.02em;
      color: #111; border-bottom: 2px solid #111;
      padding-bottom: 10pt; margin-bottom: 24pt;
    }
    h2 {
      font-size: 13pt; font-weight: 700; letter-spacing: 0.06em;
      text-transform: uppercase; color: #333;
      margin-top: 28pt; margin-bottom: 8pt;
    }
    h3 { font-size: 11pt; font-weight: 700; color: #444; margin-top: 16pt; margin-bottom: 6pt; }
    p { margin-bottom: 10pt; }
    ul { padding-left: 20pt; margin-bottom: 10pt; }
    li { margin-bottom: 4pt; }
    em { font-style: italic; color: #555; }
    strong { font-weight: 700; }
    code { font-family: 'Courier New', monospace; font-size: 9pt; background: #f5f5f5; padding: 1pt 4pt; }
    hr { border: none; border-top: 1px solid #ddd; margin: 20pt 0; }
    a { color: #2563eb; text-decoration: none; }
    .links, .attachments { margin-top: 32pt; padding-top: 16pt; border-top: 1px solid #eee; }
    figure img { max-width: 100%; }
    .footer {
      margin-top: 48pt; padding-top: 12pt; border-top: 1px solid #eee;
      font-size: 8pt; color: #aaa; text-align: center;
    }
    @media print { body { padding: 0; } a { color: #2563eb; } }
  </style>
</head>
<body>
  ${bodyHtml}
  ${imagesHtml}
  ${linksHtml}
  ${attachmentRefsHtml}
  <div class="footer">Generated by PRDCR &middot; ${plainTextToHtml(generatedAt)}</div>
</body>
</html>`;

      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeFilename}.html"`,
        },
      });
    }

    // ── DOCX export ──────────────────────────────────────────────────────────
    const contentParagraphs = markdownToDocxParagraphs(content);

    if (links.length) {
      contentParagraphs.push(
        new Paragraph({
          text: "",
          spacing: { before: 400 },
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" } },
        }),
        new Paragraph({
          text: "Links & References",
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 120 },
        }),
        ...links.map(
          (l) =>
            new Paragraph({
              bullet: { level: 0 },
              children: [
                new TextRun({ text: l.label ? `${l.label}: ` : "", bold: !!l.label }),
                new TextRun({ text: l.url, color: "2563EB" }),
              ],
              spacing: { after: 60 },
            })
        )
      );
    }

    // Attachments section in DOCX — list as references with signed URLs
    const allAttachmentsForDocx = [...imageAttachments, ...otherAttachments];
    if (allAttachmentsForDocx.length > 0) {
      try {
        const supabase = await createClient();
        const attParagraphs: Paragraph[] = [
          new Paragraph({
            text: "",
            spacing: { before: 400 },
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" } },
          }),
          new Paragraph({
            text: "Attachments",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 120 },
          }),
        ];
        for (const att of allAttachmentsForDocx) {
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(att.storage_path, 7 * 24 * 3600);
          const url = signed?.signedUrl ?? "(link unavailable)";
          attParagraphs.push(
            new Paragraph({
              bullet: { level: 0 },
              children: [
                new TextRun({ text: `${att.filename}: `, bold: true }),
                new TextRun({ text: url, color: "2563EB" }),
              ],
              spacing: { after: 60 },
            })
          );
        }
        attParagraphs.push(
          new Paragraph({
            children: [new TextRun({ text: "Links expire in 7 days.", color: "AAAAAA", size: 16 })],
            spacing: { after: 80 },
          })
        );
        contentParagraphs.push(...attParagraphs);
      } catch {
        // Skip attachments section on error
      }
    }

    contentParagraphs.push(
      new Paragraph({
        text: "",
        spacing: { before: 600 },
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: "EEEEEE" } },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `Generated by PRDCR · ${generatedAt}`,
            color: "AAAAAA",
            size: 16,
          }),
        ],
      })
    );

    const doc = new Document({
      creator: "PRDCR",
      title,
      sections: [
        {
          properties: {
            page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
          },
          children: contentParagraphs,
        },
      ],
      styles: {
        default: {
          document: {
            run: { font: "Calibri", size: 22 },
            paragraph: { spacing: { line: 360 } },
          },
        },
      },
    });

    const buffer = await Packer.toBuffer(doc);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeFilename}.docx"`,
      },
    });
  } catch (err) {
    const status = err instanceof ValidationError ? err.statusCode : 500;
    console.error("notes/export error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status }
    );
  }
}
