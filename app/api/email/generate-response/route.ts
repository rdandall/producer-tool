import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSetting } from "@/lib/db/settings";

const anthropic = new Anthropic();

export interface GenerateResponseResult {
  variants: {
    punchy: string;
    balanced: string;
    detailed: string;
  };
  smartInserts: Array<{ label: string; text: string }>;
  phaseSignal: {
    detected: boolean;
    description: string;
    suggestedAction: string;
    phaseId: string | null;
  } | null;
  mentionedDates: Array<{
    raw: string;
    iso: string | null;
    context: string;
  }>;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    thread,
    projectContext,
    phases,
    tasks,
    variantType, // optional — regenerate only one variant
    userNotes,   // optional — dictated notes/instructions from user
  } = body;

  const [toneProfile, styleNote] = await Promise.all([
    getSetting("gmail_tone_profile"),
    getSetting("gmail_style_note"),
  ]);

  const threadMessages = Array.isArray(thread) ? thread : [thread];
  const threadText = threadMessages
    .map(
      (msg: {
        from_email?: string;
        from?: { email?: string };
        received_at?: string;
        receivedAt?: string;
        body_text?: string;
        bodyText?: string;
        snippet?: string;
        subject?: string;
      }) =>
        `FROM: ${msg.from_email ?? msg.from?.email ?? "unknown"}\n` +
        `SUBJECT: ${msg.subject ?? "(No subject)"}\n` +
        `DATE: ${msg.received_at ?? msg.receivedAt ?? ""}\n\n` +
        (msg.body_text ?? msg.bodyText ?? msg.snippet ?? "").slice(0, 2000)
    )
    .join("\n\n--- EARLIER MESSAGE ---\n\n");

  const systemPrompt = `You are an expert email assistant for a video producer. Generate high-quality, natural email responses.

${
  toneProfile
    ? `TONE PROFILE (learned from user's sent email history):
${toneProfile}`
    : ""
}

${
  styleNote
    ? `USER'S PERSONAL STYLE NOTE:
${styleNote}`
    : ""
}

${
  projectContext
    ? `RELATED PROJECT CONTEXT:
${JSON.stringify(projectContext, null, 2)}`
    : ""
}

${
  phases?.length
    ? `PROJECT PHASES (IDs are the real database UUIDs — use them exactly):
${phases
  .map(
    (p: { id: string; name: string; status: string; start_date?: string; end_date?: string }) =>
      `- [${p.id}] ${p.name}: ${p.status} (${p.start_date ?? "?"} to ${p.end_date ?? "ongoing"})`
  )
  .join("\n")}`
    : ""
}

${
  tasks?.length
    ? `RELEVANT TASKS:
${tasks
  .slice(0, 8)
  .map(
    (t: { title: string; priority?: string; due_date?: string }) =>
      `- ${t.title} (${t.priority ?? "medium"} priority, due: ${t.due_date ?? "no date"})`
  )
  .join("\n")}`
    : ""
}

${
  userNotes
    ? `USER'S DICTATED NOTES / REPLY INSTRUCTIONS:
The user has spoken or typed the following notes about how they want to reply. Prioritize these instructions and incorporate them into the generated responses:
${userNotes}`
    : ""
}

Respond ONLY with a valid JSON object. No markdown fences, no extra text.`;

  const variantInstructions = variantType
    ? `Generate ONLY the "${variantType}" variant. Return JSON with just: { "variants": { "${variantType}": "..." }, "smartInserts": [], "phaseSignal": null, "mentionedDates": [] }`
    : `Generate all three variants and full analysis.`;

  const userPrompt = `${variantInstructions}

EMAIL THREAD (oldest to newest):
${threadText}

Return this exact JSON structure:
{
  "variants": {
    "punchy": "Short, direct reply — 1 to 3 sentences max. Get to the point immediately.",
    "balanced": "Standard professional reply — 2 to 4 paragraphs. Natural tone, covers the main points.",
    "detailed": "Thorough reply — 3 to 6 paragraphs. Addresses everything comprehensively."
  },
  "smartInserts": [
    {
      "label": "Brief label (3-5 words)",
      "text": "The full text to insert into the email. Can be multiple sentences."
    }
  ],
  "phaseSignal": {
    "detected": true,
    "description": "Client approved the final cut",
    "suggestedAction": "Move to Delivered",
    "phaseId": "the-exact-uuid-from-the-phases-list-or-null"
  },
  "mentionedDates": [
    {
      "raw": "March 15th",
      "iso": "2026-03-15",
      "context": "Suggested shoot date"
    }
  ]
}

For smartInserts: generate 4 to 8 inserts. Be creative and UNRESTRICTED — include anything useful: project updates, asset links, clarifying questions, policies, context the sender doesn't have, historical references, scheduling notes, pricing terms, revision limits — whatever would genuinely improve this reply.

For phaseSignal: look for clear language indicating project approval ("looks great", "approved", "sign off"), rejection/revision ("please redo", "change this"), or delivery ("received", "thank you for delivering"). When detected, set phaseId to the UUID (the value inside the brackets) of the matching phase from the PROJECT PHASES list above. The phaseId MUST be one of those exact UUID strings, or null if no phases are listed or none match.

For mentionedDates: extract any specific dates, days, or timeframes mentioned in the email thread. Convert to ISO if possible, otherwise set iso to null.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No valid JSON in AI response");

    const result: GenerateResponseResult = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Generation failed";
    console.error("Generate response error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
