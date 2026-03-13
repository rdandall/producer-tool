import { NextResponse } from "next/server";
import { getValidGmailToken, listInboxMessages } from "@/lib/gmail";
import { upsertEmails, getAllEmails, getPendingTaskSuggestions } from "@/lib/db/emails";
import { getSetting } from "@/lib/db/settings";
import { getProjects } from "@/lib/db/projects";
import { extractTasksFromEmail } from "@/lib/email-task-extraction";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const token = await getValidGmailToken();
  if (!token) {
    return NextResponse.json({ error: "Not connected to Gmail" }, { status: 401 });
  }

  try {
    const limitStr = await getSetting("email_sync_limit");
    const limit = parseInt(limitStr ?? "100", 10) || 100;

    const messages = await listInboxMessages(token, limit);

    // Track which message IDs are new before upserting
    const supabase = await createClient();
    const incomingIds = messages.map((m) => m.id);
    const { data: existingRows } = await supabase
      .from("emails")
      .select("gmail_message_id, id")
      .in("gmail_message_id", incomingIds);
    const existingGmailIds = new Set((existingRows ?? []).map((r) => r.gmail_message_id as string));

    const newCount = await upsertEmails(messages);

    // ── Auto task extraction for new emails ──────────────────────────────────
    // Only scan emails from senders on the allowlist (set in Settings).
    // Fire-and-forget: don't block the sync response.
    const filterRaw = await getSetting("email_task_filter_addresses");
    const allowlist: string[] = filterRaw ? (JSON.parse(filterRaw) as string[]) : [];

    let taskSuggestionsAdded = 0;

    if (allowlist.length > 0 && newCount > 0) {
      // Get the DB IDs for newly inserted emails
      const newGmailIds = messages
        .filter((m) => !existingGmailIds.has(m.id) && !m.isSent)
        .map((m) => m.id);

      if (newGmailIds.length > 0) {
        const { data: newEmailRows } = await supabase
          .from("emails")
          .select("id, gmail_message_id, from_email, body_text, snippet, subject")
          .in("gmail_message_id", newGmailIds);

        const projects = await getProjects();
        const projectList = projects.map((p) => ({
          id: p.id,
          title: p.title,
          client: p.client,
        }));

        // Run extractions concurrently for allowlisted senders
        const results = await Promise.allSettled(
          (newEmailRows ?? [])
            .filter((e) =>
              allowlist.some(
                (addr) => addr.toLowerCase() === (e.from_email as string)?.toLowerCase()
              )
            )
            .map((e) =>
              extractTasksFromEmail({
                emailId: e.id as string,
                emailContent: (e.body_text ?? e.snippet ?? "") as string,
                subject: e.subject as string | null,
                fromEmail: e.from_email as string | null,
                projects: projectList,
              })
            )
        );

        taskSuggestionsAdded = results.reduce((sum, r) => {
          return sum + (r.status === "fulfilled" ? r.value : 0);
        }, 0);
      }
    }

    // Return fresh email list + updated task suggestions
    const [emails, taskSuggestions] = await Promise.all([
      getAllEmails(),
      taskSuggestionsAdded > 0 ? getPendingTaskSuggestions() : Promise.resolve(null),
    ]);

    return NextResponse.json({
      synced: newCount,
      total: messages.length,
      emails,
      taskSuggestionsAdded,
      ...(taskSuggestions ? { taskSuggestions } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("Email sync error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
