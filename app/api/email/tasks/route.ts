import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { insertTaskSuggestions, updateTaskSuggestionStatus } from "@/lib/db/emails";

const anthropic = new Anthropic();

/** POST: Extract task suggestions from an email body */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { emailId, emailContent, subject, fromEmail, projects } = body;

  if (!emailId || !emailContent) {
    return NextResponse.json({ error: "Missing emailId or emailContent" }, { status: 400 });
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: `Extract clear action items from this email. Return ONLY valid JSON.

EMAIL SUBJECT: ${subject ?? "(No subject)"}
FROM: ${fromEmail ?? "unknown"}

EMAIL CONTENT:
${String(emailContent).slice(0, 2500)}

${
  projects?.length
    ? `KNOWN PROJECTS (match if relevant):
${(projects as Array<{ id: string; title: string; client?: string | null }>)
  .map((p) => `- ${p.id}: "${p.title}"${p.client ? ` (client: ${p.client})` : ""}`)
  .join("\n")}`
    : ""
}

Return JSON:
{
  "tasks": [
    {
      "title": "Action item phrased as a clear task",
      "priority": "high|medium|low",
      "project_id": "matching project id or null",
      "due_hint": "YYYY-MM-DD or null"
    }
  ]
}

Only include genuine, actionable tasks — things that require follow-up or work. Skip general conversational content. If no tasks, return { "tasks": [] }.`,
        },
      ],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ inserted: 0 });

    const { tasks } = JSON.parse(jsonMatch[0]) as {
      tasks: Array<{
        title: string;
        priority?: string;
        project_id?: string | null;
        due_hint?: string | null;
      }>;
    };

    if (!tasks?.length) return NextResponse.json({ inserted: 0 });

    await insertTaskSuggestions(
      tasks.map((t) => ({
        email_id: emailId as string,
        title: t.title,
        priority: t.priority ?? "medium",
        project_id: t.project_id ?? null,
        due_hint: t.due_hint ?? null,
      }))
    );

    return NextResponse.json({ inserted: tasks.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Task extraction failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PATCH: Approve or dismiss a task suggestion */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, status } = body;

  if (!id || !["approved", "dismissed"].includes(status)) {
    return NextResponse.json({ error: "Invalid id or status" }, { status: 400 });
  }

  await updateTaskSuggestionStatus(id as string, status as "approved" | "dismissed");
  return NextResponse.json({ success: true });
}
