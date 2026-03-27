import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getValidGmailToken, searchSentEmails } from "@/lib/gmail";
import { setSetting } from "@/lib/db/settings";
import { checkRateLimit } from "@/lib/rate-limit";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST() {
  const rate = checkRateLimit(new Request("/api/email/analyze-tone"), "email.analyzeTone", 6, 60_000);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfter: rate.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  const token = await getValidGmailToken();
  if (!token) {
    return NextResponse.json({ error: "Not connected to Gmail" }, { status: 401 });
  }

  try {
    const sentEmails = await searchSentEmails(token, 150);
    const substantive = sentEmails.filter((e) => e.bodyText.length > 80);

    if (!substantive.length) {
      return NextResponse.json(
        { error: "Not enough sent emails found to analyze" },
        { status: 400 }
      );
    }

    const sample = substantive
      .slice(0, 50)
      .map((e) => `SUBJECT: ${e.subject}\n\n${e.bodyText.slice(0, 600)}`)
      .join("\n\n---\n\n");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: `Analyze the communication style and tone of these sent emails from a video producer. Write a concise tone profile (2-3 paragraphs) that captures:

- Formality level and vocabulary choices
- How they open and close emails (specific phrases if recurring)
- Typical email length and structure
- How they handle requests, feedback, approvals, and follow-ups
- Their personality in writing — are they direct, warm, formal, casual?
- Any distinctive phrases or patterns

This profile will be used to generate emails that sound authentically like this person.

SENT EMAILS:
${sample}`,
        },
      ],
    });

    const profile = message.content[0].type === "text" ? message.content[0].text : "";

    await Promise.all([
      setSetting("gmail_tone_profile", profile),
      setSetting("gmail_tone_sample_count", String(substantive.length)),
    ]);

    return NextResponse.json({
      profile,
      sampleCount: substantive.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Tone analysis failed";
    console.error("Analyze tone error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
