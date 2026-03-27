import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSetting } from "@/lib/db/settings";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody, requireString, ValidationError } from "@/lib/validation";

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
    iso: string;
    context: string;
  }>;
}

export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(req, "email.generateResponse", 12, 60_000);
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rate.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
      );
    }

    const body = await parseJsonBody(req);
    const thread = Array.isArray(body.thread) ? body.thread : [];
    const variantType = requireString(body.variantType, "variantType", { required: false, maxLength: 24 }) ?? "";
    const projectContext = body.projectContext;
    const phases = Array.isArray(body.phases) ? body.phases : [];
    const tasks = Array.isArray(body.tasks) ? body.tasks : [];
    const userNotes = requireString(body.userNotes, "userNotes", { required: false, maxLength: 10000 }) ?? undefined;

    if (!thread.length) {
      return NextResponse.json({ error: "thread is required" }, { status: 400 });
    }

    const [toneProfile, styleNote] = await Promise.all([
      getSetting("gmail_tone_profile"),
      getSetting("gmail_style_note"),
    ]);

    const threadMessages = thread.map(
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
    ).join("\n\n--- EARLIER MESSAGE ---\n\n");

    const systemPrompt = `You are an expert email assistant for a video producer. Generate high-quality, natural email responses.\n\n${
      toneProfile ? `TONE PROFILE (learned from user's sent email history):\n${toneProfile}` : ""
    }\n\n${styleNote ? `USER'S PERSONAL STYLE NOTE:\n${styleNote}` : ""}\n\n${
      projectContext
        ? `RELATED PROJECT CONTEXT:\n${JSON.stringify(projectContext, null, 2)}`
        : ""
    }\n\n${
      phases?.length
        ? `PROJECT PHASES (IDs are the real database UUIDs — use them exactly):\n${phases
            .map(
              (p: { id: string; name: string; status: string; start_date?: string; end_date?: string }) =>
                `- [${p.id}] ${p.name}: ${p.status} (${p.start_date ?? "?"} to ${p.end_date ?? "ongoing"})`
            )
            .join("\n")}`
        : ""
    }\n\n${
      tasks?.length
        ? `RELEVANT TASKS:\n${tasks
            .slice(0, 8)
            .map(
              (t: { title: string; priority?: string; due_date?: string }) =>
                `- ${t.title} (${t.priority ?? "medium"} priority, due: ${t.due_date ?? "no date"})`
            )
            .join("\n")}`
        : ""
    }\n\n${userNotes ? `USER'S DICTATED NOTES / REPLY INSTRUCTIONS:\n${userNotes}` : ""}\n\nRespond ONLY with a valid JSON object. No markdown fences, no extra text.`;

    const variantInstructions = variantType
      ? `Generate ONLY the "${variantType}" variant. Return JSON with just: { "variants": { "${variantType}": "..." }, "smartInserts": [], "phaseSignal": null, "mentionedDates": [] }`
      : `Generate all three variants and full analysis.`;

    const userPrompt = `${variantInstructions}\n\nEMAIL THREAD (oldest to newest):\n${threadMessages}\n\nReturn this exact JSON structure:\n{ ... }`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: systemPrompt,
      tools: [
        {
          name: "generate_email_response",
          description: "Generate email reply variants and analysis",
          input_schema: {
            type: "object" as const,
            properties: {
              variants: {
                type: "object",
                properties: {
                  punchy: { type: "string" },
                  balanced: { type: "string" },
                  detailed: { type: "string" },
                },
                required: variantType ? [variantType] : ["punchy", "balanced", "detailed"],
              },
              smartInserts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    text: { type: "string" },
                  },
                  required: ["label", "text"],
                },
              },
              phaseSignal: {
                type: "object",
                properties: {
                  detected: { type: "boolean" },
                  description: { type: "string" },
                  suggestedAction: { type: "string" },
                  phaseId: { type: "string" },
                },
                required: ["detected", "description", "suggestedAction"],
              },
              mentionedDates: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    raw: { type: "string" },
                    iso: { type: "string" },
                    context: { type: "string" },
                  },
                  required: ["raw", "context"],
                },
              },
            },
            required: ["variants", "smartInserts", "mentionedDates"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "generate_email_response" },
      messages: [{ role: "user", content: userPrompt }],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("No tool use in AI response");
    }

    const result = toolUse.input as GenerateResponseResult;
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const msg = err instanceof Error ? err.message : "Generation failed";
    console.error("Generate response error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
