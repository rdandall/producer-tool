import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody, requireString, ValidationError } from "@/lib/validation";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Doc type labels ───────────────────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  "brief":          "Edit Brief",
  "meeting-notes":  "Meeting / Call Notes",
  "project-notes":  "Project Notes",
  "client-brief":   "Client-Facing Brief",
  "notes":          "Notes",
  "note":           "General Note",
  "quote":          "Quote / Estimate",
  "idea":           "Idea",
  "spec":           "Spec",
  "project-update": "Project Update",
};

// ── Doc type structure templates ─────────────────────────────────────────────

const DOC_TYPE_STRUCTURES: Record<string, string> = {
  brief: `# Edit Brief — {title}

## Project Overview
[Client, deliverables, and overall goal in 2–3 sentences]

## Creative Direction
[Tone, style, visual references, what the piece should feel like]

## Deliverables
[List of specific outputs — formats, lengths, aspect ratios]

## Timeline
[Key milestones and deadlines]

## Notes for Editor
[Any specific instructions, concerns, things to watch out for]`,

  "meeting-notes": `# {title}
*{date}*

## Attendees
[Who was on the call]

## Key Points Discussed
[Main topics covered]

## Decisions Made
[What was agreed]

## Action Items
[What needs to happen next — include who is responsible]

## Follow-Ups
[Things to chase, open questions]`,

  "project-notes": `# {title}

## Summary
[What these notes cover]

## Details
[Main body of notes]

## Action Items
[Tasks or next steps]

## Links & References
[Any relevant links mentioned]`,

  "client-brief": `# {title}
*Prepared by PRDCR*

## Project Overview
[What this project is, for whom, and why]

## Objectives
[What the film/content needs to achieve]

## Creative Direction
[Tone, style, references]

## Deliverables
[Exact outputs — formats, lengths, quantities]

## Timeline & Key Dates
[Production schedule]

## Budget Notes
[If applicable]

## Next Steps
[What happens next]`,

  "notes": `# {title}

[Clean, structured version of the notes]`,

  "note": `# {title}

[Clean version of the note]`,

  "quote": `# Quote — {title}
*Prepared by PRDCR*

## Project Summary
[Brief description of what's being quoted]

## Scope of Work
[Detailed list of what's included]

## Investment
[Cost breakdown — line items where possible]

## Timeline
[Estimated turnaround]

## Terms
[Payment terms, revision rounds, what's excluded]

## Next Steps
[How to approve / proceed]`,

  "idea": `# {title}

## The Idea
[Core concept in plain terms]

## Why It Works
[What makes this compelling]

## What It Would Look Like
[Rough description of execution — format, tone, style]

## Who It's For
[Target audience or client fit]

## What's Needed
[Resources, people, gear, time]

## Next Step
[What to do to move this forward]`,

  "spec": `# Spec: {title}

## Overview
[What this spec covers and why]

## Goals
[What this needs to achieve]

## Technical Requirements
[Specific parameters — format, codec, resolution, frame rate, etc.]

## Deliverables
[Exact file list with specs]

## Notes
[Anything else the team needs to know]`,

  "project-update": `# Project Update — {title}
*{date}*

## Status
[One-line summary: on track / at risk / blocked]

## Progress This Week
[What got done]

## Next Steps
[What happens next, who's responsible]

## Blockers / Risks
[Anything holding things up or that could go wrong]

## Key Dates
[Upcoming milestones]`,
};

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(req, "notes.generate", 30, 60_000);
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rate.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
      );
    }

    const body = await parseJsonBody(req);
    const rawInput = requireString(body.rawInput, "rawInput", { required: true, maxLength: 25000 }) ?? "";
    const type = requireString(body.type, "type", { required: false, maxLength: 32 }) || "project-notes";
    const projectContext = body.projectContext;

    // Attachment context: text extracted from context/both-role attachments
    const attachmentContextItems: Array<{ filename: string; text: string }> =
      Array.isArray(body.attachmentContext) ? body.attachmentContext : [];

    const docTypeLabel = DOC_TYPE_LABELS[type] ?? "Document";
    const docStructure = DOC_TYPE_STRUCTURES[type] ?? DOC_TYPE_STRUCTURES["project-notes"];
    const today = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const projectInfo =
      typeof projectContext === "object" && projectContext
        ? `\nProject context: "${(projectContext as { title?: string }).title ?? ""}"${
            (projectContext as { client?: string }).client
              ? ` for ${(projectContext as { client?: string }).client}`
              : ""
          }${
            (projectContext as { brief?: string }).brief
              ? `\nProject brief: ${(projectContext as { brief?: string }).brief}`
              : ""
          }`
        : "";

    const attachmentInfo =
      attachmentContextItems.length > 0
        ? `\n\nAttached reference material (use as context when generating the document):\n${attachmentContextItems
            .map((a) => `--- ${a.filename} ---\n${a.text.slice(0, 3000)}`)
            .join("\n\n")}`
        : "";

    const systemPrompt = `You are a production assistant for PRDCR, a professional video production company. You transform raw voice dictation and rough notes into clean, structured documents.

Today's date: ${today}
Document type requested: ${docTypeLabel}${projectInfo}

Your job:
1. Parse the raw, often rambling input and extract the key information
2. Format it as a clean ${docTypeLabel} using proper markdown
3. Extract any action items or tasks (things like "tell James to...", "ask Layla...", "I need to...", "remind me to...", "make sure...")
4. For each extracted task, identify: who it's assigned to (if mentioned), estimated priority, and any due date hint

Document structure to follow:
${docStructure}

Rules:
- Title should be specific (include project/client name if mentioned, date for meeting notes)
- Content should be clean, well-structured markdown — not just copied from input
- Remove filler words, false starts, repetition from dictation
- Tasks in extractedTasks should NOT also appear in the document content — they're handled separately
- If no tasks are detected, extractedTasks should be an empty array
- Keep the document professional but not stiff
- If attached reference material is provided, incorporate relevant details naturally into the document`;

    const userContent = attachmentInfo
      ? `${rawInput}\n${attachmentInfo}`
      : rawInput;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      tools: [
        {
          name: "generate_document",
          description: "Generate a structured document from raw input",
          input_schema: {
            type: "object" as const,
            properties: {
              title: { type: "string" },
              content: { type: "string" },
              extractedTasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    assignedTo: { type: "string" },
                    priority: { type: "string", enum: ["high", "medium", "low"] },
                    dueHint: { type: "string" },
                  },
                  required: ["title", "priority"],
                },
              },
            },
            required: ["title", "content", "extractedTasks"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "generate_document" },
      messages: [{ role: "user", content: userContent }],
      system: systemPrompt,
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("AI did not return a tool use response");
    }
    const parsed = toolUse.input as {
      title: string;
      content: string;
      extractedTasks: Array<{
        title: string;
        assignedTo?: string;
        priority: string;
        dueHint?: string;
      }>;
    };

    return NextResponse.json({
      title: parsed.title ?? "Untitled Note",
      content: parsed.content ?? "",
      extractedTasks: parsed.extractedTasks ?? [],
    });
  } catch (err) {
    const status = err instanceof ValidationError ? err.statusCode : 500;
    console.error("notes/generate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status }
    );
  }
}
