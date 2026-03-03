import { NextRequest, NextResponse } from "next/server";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, TableRow, TableCell, Table,
  WidthType,
} from "docx";

// ── Markdown → DOCX paragraphs ──────────────────────────────────────────────
function markdownToDocxParagraphs(markdown: string): Paragraph[] {
  const lines = markdown.split("\n");
  const paragraphs: Paragraph[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // H1
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

    // H2
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

    // H3
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

    // Bullet list
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

    // Italic (leading *)
    if (line.startsWith("*") && line.endsWith("*") && line.length > 2) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: line.slice(1, -1), italics: true })],
          spacing: { after: 60 },
        })
      );
      continue;
    }

    // Bold (**text**)
    const boldText = line.replace(/\*\*(.*?)\*\*/g, (_, t) => t);
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
      paragraphs.push(
        new Paragraph({ children: runs, spacing: { after: 80 } })
      );
      continue;
    }

    // Horizontal rule
    if (line === "---" || line === "***" || line === "___") {
      paragraphs.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" } },
          spacing: { before: 200, after: 200 },
        })
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      paragraphs.push(new Paragraph({ text: "", spacing: { after: 80 } }));
      continue;
    }

    // Normal paragraph
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: boldText })],
        spacing: { after: 80 },
      })
    );
  }

  return paragraphs;
}

// ── Markdown → clean HTML for PDF ───────────────────────────────────────────
function markdownToHtml(markdown: string): string {
  let html = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Process line by line for headings and lists
  const lines = html.split("\n");
  const output: string[] = [];
  let inList = false;

  for (const line of lines) {
    if (line.startsWith("# ")) {
      if (inList) { output.push("</ul>"); inList = false; }
      output.push(`<h1>${line.slice(2)}</h1>`);
    } else if (line.startsWith("## ")) {
      if (inList) { output.push("</ul>"); inList = false; }
      output.push(`<h2>${line.slice(3)}</h2>`);
    } else if (line.startsWith("### ")) {
      if (inList) { output.push("</ul>"); inList = false; }
      output.push(`<h3>${line.slice(4)}</h3>`);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) { output.push("<ul>"); inList = true; }
      output.push(`<li>${formatInline(line.slice(2))}</li>`);
    } else if (line.trim() === "" || line === "---") {
      if (inList) { output.push("</ul>"); inList = false; }
      if (line === "---") {
        output.push("<hr>");
      } else {
        output.push("<br>");
      }
    } else {
      if (inList) { output.push("</ul>"); inList = false; }
      output.push(`<p>${formatInline(line)}</p>`);
    }
  }

  if (inList) output.push("</ul>");
  return output.join("\n");
}

function formatInline(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>");
}

// ── Route ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { content, title, format, links } = await req.json();

    if (!content) {
      return NextResponse.json({ error: "No content provided" }, { status: 400 });
    }

    // ── PDF: return styled HTML for browser print-to-PDF ──────────────────
    if (format === "pdf") {
      const bodyHtml = markdownToHtml(content);
      const linksHtml = links?.length
        ? `<section class="links"><h2>Links &amp; References</h2><ul>${links.map((l: { label: string; url: string }) => `<li><a href="${l.url}">${l.label || l.url}</a></li>`).join("")}</ul></section>`
        : "";

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title ?? "Document"}</title>
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
  <div class="footer">Generated by PRDCR &middot; ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div>
</body>
</html>`;

      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `attachment; filename="${(title ?? "document").replace(/[^a-z0-9]/gi, "-")}.html"`,
        },
      });
    }

    // ── DOCX ──────────────────────────────────────────────────────────────
    if (format === "docx") {
      const contentParagraphs = markdownToDocxParagraphs(content);

      // Append links section if present
      if (links?.length) {
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
            (l: { label: string; url: string }) =>
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

      // Footer
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
              text: `Generated by PRDCR · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
              color: "AAAAAA",
              size: 16,
            }),
          ],
        })
      );

      const doc = new Document({
        creator: "PRDCR",
        title: title ?? "Document",
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
      const safeTitle = (title ?? "document").replace(/[^a-z0-9]/gi, "-");

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${safeTitle}.docx"`,
        },
      });
    }

    return NextResponse.json({ error: "Invalid format" }, { status: 400 });
  } catch (err) {
    console.error("notes/export error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 500 }
    );
  }
}
