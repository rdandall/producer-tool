import { NextResponse } from "next/server";
import { parseJsonBody, requireString, ValidationError } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_DICTATION_MODEL = process.env.OPENAI_DICTATION_MODEL ?? "gpt-4.1-mini";

function getContextHint(contextType: string): string {
  switch (contextType) {
    case "meeting-notes":
      return "Favor clean sentences, concise paragraphs, and markdown bullets only when the speaker is clearly listing items.";
    case "project-notes":
      return "Favor direct production notes with crisp task phrasing and markdown bullets when the speaker is clearly listing items.";
    case "client-brief":
      return "Favor polished client-facing phrasing, but keep the user's wording and intent intact.";
    case "email-body":
      return "Favor natural email prose with correct punctuation and sentence flow. Keep lists as bullets only if the speaker is clearly dictating a list meant to stay as a list.";
    case "email-notes":
      return "Favor concise email drafting notes with clean bullets only when the speaker is clearly listing talking points.";
    case "project-brief":
      return "Favor clean brief notes that stay close to the speaker's wording. Do not rewrite them into a final polished summary.";
    case "phase-notes":
      return "Favor short operational phase notes with clear logistics, dates, and deliverables preserved exactly.";
    case "client-notes":
      return "Favor concise relationship notes and context, keeping names and factual details unchanged.";
    case "calendar-notes":
      return "Favor clear event notes, logistics, agenda items, and attendee details with clean punctuation.";
    case "document-body":
      return "Favor readable document prose with natural paragraphs and markdown bullets only when the speaker is clearly listing items.";
    case "task-title":
      return "Favor a short, clear task title. Never use bullets, numbering, or multiple paragraphs.";
    case "assistant-command":
      return "Favor a concise command with names, dates, and constraints preserved exactly. Never use bullets or commentary.";
    case "brief":
    default:
      return "Favor clean producer-style notes with minimal rewriting and natural sentence flow.";
  }
}

function buildSystemPrompt(mode: "live" | "final", contextType: string): string {
  return `You are a live dictation formatter inside a notes app.

Your job is to make dictated text readable immediately while changing as little as possible.

Hard rules:
- Keep at least 90% of the user's original wording unless a filler word, false start, or self-correction clearly needs cleanup
- Never summarize, shorten, or drop concrete details
- Preserve names, dates, times, numbers, task wording, and nuance
- Add punctuation, capitalization, apostrophes, sentence boundaries, and paragraph breaks
- Remove filler words only when they add no meaning
- Clean obvious false starts only when the intended meaning is clear
- Respect spoken corrections like "actually", "no", "scratch that", "I mean", and "rather" by updating the recent phrase
- If the speaker is clearly listing items, steps, or deliverables, format them as markdown bullets or a numbered list
- If it is not clearly a list, keep it as normal prose
- Do not add headings, labels, explanations, or commentary
- Output only the polished dictated segment, never the surrounding note

Style hint:
${getContextHint(contextType)}

${mode === "live"
    ? "This is a live pass, so favor fast, stable cleanup that reads naturally as the user speaks."
    : "This is the final pass after dictation stops, so do one last light polish without rewriting the user's meaning."}`;
}

function buildUserPrompt(dictationText: string, existingText: string): string {
  return `Existing note text before this dictation:
${existingText || "(empty)"}

Current dictated segment to clean up:
${dictationText}

Format only the current dictated segment. Do not repeat or rewrite the existing note text.`;
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured for live dictation formatting" },
        { status: 500 }
      );
    }

    const rate = checkRateLimit(req, "dictation.live-format", 240, 60_000);
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rate.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
      );
    }

    const body = await parseJsonBody(req);
    const dictationText = requireString(body.dictationText, "dictationText", { required: true, maxLength: 20000 }) ?? "";
    const existingText = requireString(body.existingText, "existingText", { required: false, maxLength: 20000 }) ?? "";
    const contextType =
      requireString(body.contextType, "contextType", { required: false, maxLength: 32 }) ??
      requireString(body.noteType, "noteType", { required: false, maxLength: 32 }) ??
      "brief";
    const modeValue = requireString(body.mode, "mode", { required: false, maxLength: 16 }) ?? "live";
    const mode = modeValue === "final" ? "final" : "live";

    if (!dictationText.trim()) {
      return new Response("", {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const upstream = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_DICTATION_MODEL,
        stream: true,
        max_completion_tokens: 900,
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(mode, contextType),
          },
          {
            role: "user",
            content: buildUserPrompt(dictationText, existingText),
          },
        ],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text();
      let message = detail || "OpenAI live dictation request failed";
      const retryAfter = upstream.headers.get("retry-after");

      try {
        const parsed = JSON.parse(detail) as { error?: { message?: string } };
        if (parsed.error?.message) {
          message = parsed.error.message;
        }
      } catch {
        // Keep raw upstream text if it isn't valid JSON.
      }

      console.error("dictation/live-format OpenAI error:", upstream.status, message);
      return NextResponse.json(
        { error: message },
        {
          status: upstream.status || 500,
          headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
        }
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = upstream.body.getReader();

    const readable = new ReadableStream({
      async start(controller) {
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            while (true) {
              const lineBreakIndex = buffer.indexOf("\n");
              if (lineBreakIndex === -1) break;

              const line = buffer.slice(0, lineBreakIndex).trim();
              buffer = buffer.slice(lineBreakIndex + 1);

              if (!line.startsWith("data:")) continue;

              const payload = line.slice(5).trim();
              if (!payload) continue;
              if (payload === "[DONE]") {
                controller.close();
                return;
              }

              const parsed = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const textDelta = parsed.choices?.[0]?.delta?.content;
              if (typeof textDelta === "string" && textDelta.length > 0) {
                controller.enqueue(encoder.encode(textDelta));
              }
            }
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
      cancel() {
        reader.cancel().catch(() => undefined);
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("dictation/live-format route error:", err);
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Live dictation formatting failed" },
      { status: 500 }
    );
  }
}
