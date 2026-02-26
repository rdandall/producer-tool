import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You help a film/video producer write a short project summary.

The summary should answer one question: "What is this project?"
It's surface-level — just enough for someone to glance at and understand the gist.
Think of it like a logline or elevator pitch, not a production plan.

Rules:
- Could be one sentence or two to three, depending on how much context was given.
- Mention the client/brand if known, the format (film, spot, doc, etc.), and the general vibe or concept.
- Do NOT list deliverables, technical specs, timelines, or requirements — those belong elsewhere.
- Do NOT add fluff, marketing speak, or details the producer didn't mention.
- Write in direct, present-tense, professional tone.

If there's an existing summary, refine it with any new info — don't rewrite from scratch unless the notes suggest something totally different.

SMART MODE: If the producer's input is too vague to write a useful summary (e.g. just a client name, or a single word), don't force it. Instead, write what you can and end with a brief, natural question to draw out more detail. For example:
"Brand film for Nike. What's the concept or angle you're going for?"

Output ONLY the summary text (and question if needed) — no headings, no labels.`;

export async function POST(req: Request) {
  const { input, currentBrief } = await req.json();
  if (!input?.trim()) {
    return new Response("No input provided", { status: 400 });
  }

  const userContent = currentBrief?.trim()
    ? `Current summary:\n${currentBrief}\n\nProducer's new notes:\n${input}\n\nRefine the summary.`
    : `Producer's notes:\n${input}\n\nWrite a project summary.`;

  const stream = await client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}
