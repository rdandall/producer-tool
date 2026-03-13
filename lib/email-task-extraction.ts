/**
 * Shared email task extraction logic.
 * Used by both the sync route (batch, on new emails) and the
 * thread-select path (on-demand, when opening an email).
 */

import Anthropic from "@anthropic-ai/sdk";
import { insertTaskSuggestions } from "@/lib/db/emails";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic();

interface Project {
  id: string;
  title: string;
  client?: string | null;
}

interface ExtractionParams {
  emailId: string;
  emailContent: string;
  subject?: string | null;
  fromEmail?: string | null;
  projects?: Project[];
}

/**
 * Runs AI task extraction on a single email.
 * Returns the number of suggestions inserted (0 if none found or already processed).
 */
export async function extractTasksFromEmail(params: ExtractionParams): Promise<number> {
  const { emailId, emailContent, subject, fromEmail, projects = [] } = params;

  if (!emailId || !emailContent?.trim()) return 0;

  // Skip if this email already has pending suggestions
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("email_task_suggestions")
    .select("id")
    .eq("email_id", emailId)
    .limit(1);

  if (existing && existing.length > 0) return 0;

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
  projects.length
    ? `KNOWN PROJECTS (match if relevant):
${projects
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
    if (!jsonMatch) return 0;

    const { tasks } = JSON.parse(jsonMatch[0]) as {
      tasks: Array<{
        title: string;
        priority?: string;
        project_id?: string | null;
        due_hint?: string | null;
      }>;
    };

    if (!tasks?.length) return 0;

    await insertTaskSuggestions(
      tasks.map((t) => ({
        email_id: emailId,
        title: t.title,
        priority: t.priority ?? "medium",
        project_id: t.project_id ?? null,
        due_hint: t.due_hint ?? null,
      }))
    );

    return tasks.length;
  } catch (err) {
    console.error(`extractTasksFromEmail failed for email ${emailId}:`, err);
    return 0;
  }
}
