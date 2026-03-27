import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { parseJsonBody, requireString, ValidationError } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(req, "dictation.enhance", 90, 60_000);
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rate.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
      );
    }

    const body = await parseJsonBody(req);
    const text = requireString(body.text, "text", { required: true, maxLength: 30000 });

    if (!text?.trim()) {
      return NextResponse.json({ enhanced: text });
    }

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are a smart dictation assistant. Clean up this voice transcript.

Rules:
- Remove filler words and phrases: um, uh, like, you know, basically, right, so, kind of, sort of, I mean, actually, literally, just, okay so, well
- Fix grammar and sentence structure
- Break into proper sentences
- Keep ALL the meaning and content intact — don't summarize or shorten
- Keep it natural and professional, not robotic
- If it's a command or note, keep the imperative tone
- Output ONLY the cleaned text, no explanation

Transcript:
${text}`,
        },
      ],
    });

    const enhanced =
      msg.content[0].type === "text" ? msg.content[0].text.trim() : text;

    return NextResponse.json({ enhanced });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Dictation enhancement failed" },
      { status: 500 }
    );
  }
}
