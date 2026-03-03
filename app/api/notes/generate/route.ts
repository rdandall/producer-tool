import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

const DOC_TYPE_LABELS: Record<string, string> = {
  "brief":          "Edit Brief",
  "meeting-notes":  "Meeting / Call Notes",
  "project-notes":  "Project Notes",
  "client-brief":   "Client-Facing Brief",
};

const DOC_TYPE_STRUCTURES: Record<string, string> = {
  "brief": `# Edit Brief — {title}

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
};

export async function POST(req: NextRequest) {
  try {
    const { rawInput, type, projectContext } = await req.json();

    if (!rawInput?.trim()) {
      return NextResponse.json({ error: "No input provided" }, { status: 400 });
    }

    const docTypeLabel = DOC_TYPE_LABELS[type] ?? "Document";
    const docStructure = DOC_TYPE_STRUCTURES[type] ?? DOC_TYPE_STRUCTURES["project-notes"];
    const today = new Date().toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
    });

    const projectInfo = projectContext
      ? `\nProject context: "${projectContext.title}"${projectContext.client ? ` for ${projectContext.client}` : ""}${projectContext.brief ? `\nProject brief: ${projectContext.brief}` : ""}`
      : "";

    const systemPrompt = `You are a production assistant for PRDCR, a professional video production company. You transform raw voice dictation and rough notes into clean, structured documents.

Today's date: ${today}
Document type requested: ${docTypeLabel}${projectInfo}

Your job:
1. Parse the raw, often rambling input and extract the key information
2. Format it as a clean ${docTypeLabel} using proper markdown
3. Extract any action items or tasks (things like "tell James to...", "ask Layla...", "I need to...", "remind me to...", "make sure...", "we should...")
4. For each extracted task, identify: who it's assigned to (if mentioned), estimated priority, and any due date hint

You MUST respond with valid JSON in this exact structure:
{
  "title": "short descriptive title for this document (not generic)",
  "content": "full markdown content of the document",
  "extractedTasks": [
    {
      "title": "concise task title",
      "assignedTo": "person name or null",
      "priority": "high|medium|low",
      "dueHint": "date hint string or null"
    }
  ]
}

Document structure to follow:
${docStructure}

Rules:
- Title should be specific (include project/client name if mentioned, date for meeting notes)
- Content should be clean, well-structured markdown — not just copied from input
- Remove filler words, false starts, repetition from dictation
- Tasks in extractedTasks should NOT also appear in the document content — they're handled separately
- If no tasks are detected, extractedTasks should be an empty array
- Keep the document professional but not stiff`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: rawInput,
        },
      ],
      system: systemPrompt,
    });

    const responseText = message.content[0].type === "text" ? message.content[0].text : "";

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("AI did not return valid JSON");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      title: parsed.title ?? "Untitled Note",
      content: parsed.content ?? "",
      extractedTasks: parsed.extractedTasks ?? [],
    });
  } catch (err) {
    console.error("notes/generate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
