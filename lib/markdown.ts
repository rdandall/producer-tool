export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const DISALLOWED_URL_SCHEMES = new Set(["javascript:", "data:", "vbscript:"]);

export function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "#";

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("//")) return "#";

  const colonIndex = lower.indexOf(":");
  if (colonIndex > 0) {
    const scheme = lower.slice(0, colonIndex + 1);
    if (DISALLOWED_URL_SCHEMES.has(scheme)) return "#";
  }

  return trimmed.replace(/\"/g, "&quot;").replace(/\'/g, "&#39;");
}

export function formatInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>");
}

export function renderSimpleMarkdownToHtml(markdown: string): string {
  const lines = escapeHtml(markdown || "").split("\n");
  const output: string[] = [];
  let inList = false;

  for (const line of lines) {
    if (line.startsWith("# ")) {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }
      output.push(`<h1>${line.slice(2)}</h1>`);
    } else if (line.startsWith("## ")) {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }
      output.push(`<h2>${line.slice(3)}</h2>`);
    } else if (line.startsWith("### ")) {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }
      output.push(`<h3>${line.slice(4)}</h3>`);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) {
        output.push("<ul>");
        inList = true;
      }
      output.push(`<li>${formatInlineMarkdown(line.slice(2))}</li>`);
    } else if (line.trim() === "") {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }
      output.push("<div class=\"spacer\"></div>");
    } else if (line === "---") {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }
      output.push("<hr>");
    } else {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }
      output.push(`<p>${formatInlineMarkdown(line)}</p>`);
    }
  }

  if (inList) output.push("</ul>");
  return output.join("\n");
}

export function renderMarkdownForEmail(markdown: string, options?: { useCompactList?: boolean }): string {
  const lines = escapeHtml(markdown || "").split("\n");
  const output: string[] = [];
  let inList = false;

  for (const line of lines) {
    if (line.startsWith("# ")) {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }
      output.push(`\n<h1 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px 0;padding-bottom:8px;border-bottom:2px solid #111;">${line.slice(2)}</h1>`);
    } else if (line.startsWith("## ")) {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }
      output.push(`\n<h2 style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#555;margin:24px 0 6px 0;">${line.slice(3)}</h2>`);
    } else if (line.startsWith("### ")) {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }
      output.push(`\n<h3 style="font-size:13px;font-weight:700;color:#333;margin:16px 0 4px 0;">${line.slice(4)}</h3>`);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!inList) {
        output.push(`<ul style="padding-left:18px;margin:6px 0;">`);
        inList = true;
      }
      output.push(`<li style="margin-bottom:3px;color:#333;">${formatInlineMarkdown(line.slice(2))}</li>`);
    } else if (line.trim() === "") {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }
      output.push("<br>");
    } else if (line === "---") {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }
      output.push("<hr style=\"border:none;border-top:1px solid #eee;margin:16px 0;\">");
    } else {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }
      output.push(`<p style="margin:0 0 10px 0;color:#333;line-height:1.6;">${formatInlineMarkdown(line)}</p>`);
    }
  }

  if (inList) output.push("</ul>");
  return output.join("\n");
}

export function plainTextToHtml(text: string): string {
  return escapeHtml(text ?? "").replace(/\n/g, "<br>");
}
