import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getProjects } from "@/lib/db/projects";
import { getAllEmails } from "@/lib/db/emails";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { transcript, page } = await req.json();

  const projects = await getProjects();
  const projectList = projects
    .map((p) => `- "${p.title}"${p.client ? ` (client: ${p.client})` : ""} [id: ${p.id}]`)
    .join("\n");

  // Try to fetch recent inbox threads for reply matching
  let emailContext = "none available";
  try {
    const emails = await getAllEmails();
    const threadMap = new Map<string, (typeof emails)[0]>();
    for (const email of emails) {
      if (!email.is_sent && email.gmail_thread_id && !threadMap.has(email.gmail_thread_id)) {
        threadMap.set(email.gmail_thread_id, email);
      }
    }
    const threads = Array.from(threadMap.values()).slice(0, 20);
    if (threads.length > 0) {
      emailContext = threads
        .map(
          (e) =>
            `- thread_id: ${e.gmail_thread_id} | from: ${e.from_name ?? e.from_email} <${e.from_email}> | subject: "${e.subject}"`
        )
        .join("\n");
    }
  } catch {
    // Gmail not connected or table missing — safe to ignore
  }

  const today = new Date().toISOString().split("T")[0];

  const systemPrompt = `You are an executive assistant for PRDCR, a producer management tool for video/creative producers. Parse voice commands into structured actions.

Today: ${today}
Current page: ${page}

Available projects:
${projectList || "none"}

Recent inbox email threads:
${emailContext}

Return ONLY valid JSON (no markdown fences) with this shape:
{
  "intent": "create_task" | "reply_email" | "compose_email" | "add_calendar_event" | "create_note" | "navigate" | "unknown",
  "summary": "One clear sentence describing the action — shown to user for confirmation before anything happens",
  "action_params": { ... }
}

action_params by intent:
- create_task: { "title": string, "project_id"?: string, "project_name"?: string, "due_date"?: "YYYY-MM-DD", "priority"?: "low"|"medium"|"high" }
- reply_email: { "thread_id"?: string, "sender_name"?: string, "subject_hint"?: string, "hint"?: string }
- compose_email: { "to"?: string, "subject"?: string, "hint"?: string }
- add_calendar_event: { "title": string, "date"?: "YYYY-MM-DD", "time"?: string, "duration"?: string, "notes"?: string }
- create_note: { "type"?: "brief"|"meeting-notes"|"project-notes"|"client-brief", "title"?: string, "project_name"?: string }
- navigate: { "page": string, "path": "/dashboard"|"/dashboard/email"|"/dashboard/tasks"|"/dashboard/calendar"|"/dashboard/notes"|"/dashboard/projects" }
- unknown: { "message": string }

Rules:
- For create_task: match mentioned project names to the projects list, include project_id when matched
- For reply_email: match sender name or subject to inbox threads, include thread_id when you find a match
- Dates: calculate relative dates from today (${today}). "Tomorrow" → next day, "next Monday" → next Monday
- Keep summary concise and specific, e.g. "Create a high-priority task 'Send contract to Nike' due March 20"
- Be confident — pick the most likely intent even when details are sparse`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: "user", content: transcript }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
  const match = raw.match(/\{[\s\S]*\}/);

  try {
    const parsed = match
      ? JSON.parse(match[0])
      : { intent: "unknown", summary: "I couldn't understand that command.", action_params: { message: raw } };
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({
      intent: "unknown",
      summary: "I couldn't parse that. Please try again.",
      action_params: {},
    });
  }
}
