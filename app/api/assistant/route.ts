import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getProjects } from "@/lib/db/projects";
import { getAllEmails } from "@/lib/db/emails";
import { getAllTasks } from "@/lib/db/tasks";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getUpcomingEvents() {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("calendar_events")
      .select("summary, starts_at, ends_at, location, description, all_day")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(30);
    return data ?? [];
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const { transcript, page } = await req.json();

  const today = new Date().toISOString().split("T")[0];

  const [projects, allTasks, events, emails] = await Promise.all([
    getProjects().catch(() => []),
    getAllTasks().catch(() => []),
    getUpcomingEvents(),
    getAllEmails().catch(() => []),
  ]);

  const projectList = projects
    .map((p) => {
      const phases = (p.phases ?? [])
        .map(
          (ph: { name: string; status: string; start_date?: string | null; end_date?: string | null }) =>
            `    • ${ph.name} [${ph.status}]${ph.start_date ? ` ${ph.start_date}${ph.end_date ? "→" + ph.end_date : ""}` : ""}`
        )
        .join("\n");
      return `- "${p.title}"${p.client ? ` (client: ${p.client})` : ""} [status: ${p.status}] [id: ${p.id}]${
        p.editor_name ? ` — editor: ${p.editor_name}` : ""
      }${phases ? `\n  Phases:\n${phases}` : ""}`;
    })
    .join("\n");

  const taskList = allTasks
    .filter((t) => !t.completed)
    .slice(0, 40)
    .map(
      (t) =>
        `- "${t.title}"${t.due_date ? ` [due: ${t.due_date}]` : ""} [priority: ${t.priority}]${
          t.projects ? ` [project: ${t.projects.title}]` : ""
        }${t.assigned_to ? ` [assigned: ${t.assigned_to}]` : ""}`
    )
    .join("\n");

  const eventList = events
    .slice(0, 20)
    .map(
      (e: { summary?: string | null; starts_at: string; all_day?: boolean; location?: string | null }) =>
        `- "${e.summary ?? "(no title)"}" on ${e.starts_at.split("T")[0]}${
          !e.all_day ? ` at ${e.starts_at.split("T")[1]?.slice(0, 5)}` : ""
        }${e.location ? ` @ ${e.location}` : ""}`
    )
    .join("\n");

  let emailContext = "none available";
  try {
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
    // safe
  }

  const systemPrompt = `You are an executive assistant for PRDCR, a producer management tool for a freelance video producer. Parse commands OR answer questions using the context below.

Today: ${today}
Current page: ${page}

=== PROJECTS (with phases) ===
${projectList || "none"}

=== OPEN TASKS (incomplete) ===
${taskList || "none"}

=== UPCOMING CALENDAR EVENTS ===
${eventList || "none"}

=== RECENT INBOX THREADS ===
${emailContext}

Return ONLY valid JSON (no markdown fences) with this shape:
{
  "intent": "create_task" | "reply_email" | "compose_email" | "add_calendar_event" | "create_note" | "navigate" | "query_response" | "unknown",
  "summary": "One sentence describing the action or answering the question",
  "action_params": { ... }
}

action_params by intent:
- create_task: { "title": string, "project_id"?: string, "project_name"?: string, "due_date"?: "YYYY-MM-DD", "priority"?: "low"|"medium"|"high" }
- reply_email: { "thread_id"?: string, "sender_name"?: string, "subject_hint"?: string, "hint"?: string }
- compose_email: { "to"?: string, "subject"?: string, "hint"?: string }
- add_calendar_event: { "title": string, "date"?: "YYYY-MM-DD", "time"?: string, "duration"?: string, "location"?: string, "notes"?: string }
- create_note: { "type"?: "brief"|"meeting-notes"|"project-notes"|"client-brief", "title"?: string, "project_name"?: string }
- navigate: { "page": string, "path": "/dashboard"|"/dashboard/email"|"/dashboard/tasks"|"/dashboard/calendar"|"/dashboard/notes"|"/dashboard/projects" }
- query_response: { "answer": string }
- unknown: { "message": string }

RULES:
- Use query_response for ANY question about project status, phases, editors, clients, tasks, schedule, upcoming events, or any info that can be answered from the context above. Put a full clear answer in action_params.answer.
- For create_task: match project names to the list, include project_id when matched
- For reply_email: match sender name or subject to inbox threads
- For compose_email with specific message content: put the message in action_params.hint
- Dates: calculate from today (${today}). "Tomorrow" = ${new Date(Date.now() + 86400000).toISOString().split("T")[0]}, "next Monday" = calculate correctly
- Keep summary short and specific. Be confident — always pick the most likely intent.`;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: transcript }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "{}";
  const match = raw.match(/\{[\s\S]*\}/);

  try {
    const parsed = match
      ? JSON.parse(match[0])
      : { intent: "unknown", summary: "I couldn't understand that.", action_params: { message: raw } };
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({
      intent: "unknown",
      summary: "I couldn't parse that. Please try again.",
      action_params: {},
    });
  }
}
