import { getAllEmails, getPendingTaskSuggestions } from "@/lib/db/emails";
import { getProjects } from "@/lib/db/projects";
import { getSetting } from "@/lib/db/settings";
import { createClient } from "@/lib/supabase/server";
import { EmailClient } from "@/components/email/email-client";
import { GmailConnect } from "@/components/email/gmail-connect";

export default async function EmailPage() {
  const gmailToken = await getSetting("gmail_refresh_token");
  const isConnected = !!gmailToken;

  if (!isConnected) {
    return <GmailConnect />;
  }

  const supabase = await createClient();

  const [emails, taskSuggestions, projects, hasToneProfile] = await Promise.all([
    getAllEmails(),
    getPendingTaskSuggestions(),
    getProjects(),
    getSetting("gmail_tone_profile").then((v) => !!v),
  ]);

  const { data: phases } = await supabase
    .from("phases")
    .select("id, name, project_id, status, start_date, end_date");

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, due_date, project_id")
    .not("due_date", "is", null);

  return (
    <EmailClient
      initialEmails={emails}
      initialTaskSuggestions={taskSuggestions}
      projects={projects.map((p) => ({
        id: p.id,
        title: p.title,
        client: p.client,
        color: p.color,
      }))}
      phases={(phases ?? []).map((ph) => ({
        id: ph.id,
        name: ph.name,
        project_id: ph.project_id,
        status: ph.status,
        start_date: ph.start_date ?? null,
        end_date: ph.end_date ?? null,
      }))}
      tasks={(tasks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        due_date: t.due_date ?? null,
        project_id: t.project_id ?? null,
      }))}
      hasToneProfile={hasToneProfile}
    />
  );
}
