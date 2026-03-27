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

interface LinkInput {
  label: string;
  url: string;
}

const MAX_CONTENT_LENGTH = 120000;
const MAX_TITLE_LENGTH = 200;

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
      const label = typeof (link as { label?: unknown }).label === "string" ? (link as { label?: string }).label! : "";
      const url = typeof (link as { url?: unknown }).url === "string" ? (link as { url?: string }).url! : "";
      return {
        label: label.slice(0, 160).trim(),
        url: sanitizeUrl(url),
      };
    })
    .filter((l): l is LinkInput => !!l && !!l.url && l.url !== "#");
}

// ── Markdown → DOCX paragraphs ──────────────────────────────────────────────
function markdownToDocxParagraphs(markdown: string): Paragraph[] {
  const lines = markdown.split("\n");
  const paragraphs: Paragraph[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("# ")) {
      paragraphs.push(
        new Paragraph({
          text: line.slice(2),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        })
      );
      continue;
    }

    if (line.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          text: line.slice(3),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 120 },
        })
      );
      continue;
    }

    if (line.startsWith("### ")) {
      paragraphs.push(
        new Paragraph({
          text: line.slice(4),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 80 },
        })
      );
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      paragraphs.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: line.slice(2) })],
          spacing: { after: 60 },
        })
      );
      continue;
    }

    if (line.startsWith("*") && line.endsWith("*") && line.length > 2) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: line.slice(1, -1), italics: true })],
          spacing: { after: 60 },
        })
      );
      continue;
    }

    const boldText = line.replace(/\*\*(.*?)\*\*/g, (_, t) => t);
    const hasBold = line.includes("**");

    if (line === "---" || line === "***" || line === "___") {
      paragraphs.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" } },
          spacing: { before: 200, after: 200 },
        })
      );
      continue;
    }

    if (line.trim() === "") {
      paragraphs.push(new Paragraph({ text: "", spacing: { after: 80 } }));
      continue;
    }

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

    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: boldText })],
        spacing: { after: 80 },
      })
    );
  }

  return paragraphs;
}

function htmlFromMarkdown(markdown: string): string {
  return renderSimpleMarkdownToHtml(markdown);
}

// ── Route ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(req, "notes.export", 20, 60_000);
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rate.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
      );
    }

    const body = await parseJsonBody(req);
    const content = requireString(body.content, "content", { required: true, maxLength: MAX_CONTENT_LENGTH }) ?? "";
    const titleRaw = body.title;
    const format = body.format;
    const formatStr = typeof format === "string" ? format : "";

    if (!formatStr) {
      return NextResponse.json({ error: "Missing format" }, { status: 400 });
    }

    if (formatStr !== "pdf" && formatStr !== "docx") {
      return NextResponse.json({ error: "Invalid format" }, { status: 400 });
    }

    const title = toSafeTitle(titleRaw, "Document");
    const safeFilename = title.replace(/[^a-z0-9]/gi, "-").toLowerCase() || "document";
    const links = safeLinksForHtml(body.links);

    if (formatStr === "pdf") {
      const bodyHtml = htmlFromMarkdown(content);
      const linksHtml = links.length
        ? `<section class="links"><h2>Links &amp; References</h2><ul>${links
            .map((l) => `<li><a href="${l.url}">${l.label || l.url}</a></li>`)
            .join("")}</ul></section>`
        : "";
      const generatedAt = plainTextToHtml(new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }));

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
      font-size: 22pt;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 6pt;
      color: #111;
      border-bottom: 2px solid #111;
      padding-bottom: 10pt;
      margin-bottom: 24pt;
    }
    h2 {
      font-size: 13pt;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #333;
      margin-top: 28pt;
      margin-bottom: 8pt;
    }
    h3 {
      font-size: 11pt;
      font-weight: 700;
      color: #444;
      margin-top: 16pt;
      margin-bottom: 6pt;
    }
    p { margin-bottom: 10pt; }
    ul { padding-left: 20pt; margin-bottom: 10pt; }
    li { margin-bottom: 4pt; }
    em { font-style: italic; color: #555; }
    strong { font-weight: 700; }
    code {
      font-family: 'Courier New', monospace;
      font-size: 9pt;
      background: #f5f5f5;
      padding: 1pt 4pt;
    }
    hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 20pt 0;
    }
    a { color: #2563eb; text-decoration: none; }
    .links { margin-top: 32pt; padding-top: 16pt; border-top: 1px solid #eee; }
    .footer {
      margin-top: 48pt;
      padding-top: 12pt;
      border-top: 1px solid #eee;
      font-size: 8pt;
      color: #aaa;
      text-align: center;
    }
    @media print {
      body { padding: 0; }
      a { color: #2563eb; }
    }
  </style>
</head>
<body>
  ${bodyHtml}
  ${linksHtml}
  <div class="footer">Generated by PRDCR &middot; ${generatedAt}</div>
</body>
</html>`;

      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeFilename}.html"`,
        },
      });
    }

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

    const generatedAt = plainTextToHtml(new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }));

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
            page: {
              margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
            },
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
