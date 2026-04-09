import { getAllEmails, getPendingTaskSuggestions } from "@/lib/db/emails";
import { getProjects } from "@/lib/db/projects";
import { getSetting } from "@/lib/db/settings";
import { createClient } from "@/lib/supabase/server";
import { EmailClient } from "@/components/email/email-client";
import { GmailConnect } from "@/components/email/gmail-connect";

export default async function EmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; detail?: string; connected?: string }>;
}) {
  const gmailToken = await getSetting("gmail_refresh_token");
  const isConnected = !!gmailToken;

  if (!isConnected) {
    const params = await searchParams;
    return <GmailConnect error={params.error} detail={params.detail} />;
  }

  const supabase = await createClient();
  const [
    emails,
    taskSuggestions,
    projects,
    hasToneProfile,
    filterRaw,
    calendarToken,
    userEmail,
    phasesResult,
    tasksResult,
  ] = await Promise.all([
    getAllEmails(),
    getPendingTaskSuggestions(),
    getProjects(),
    getSetting("gmail_tone_profile").then((v) => !!v),
    getSetting("email_task_filter_addresses"),
    getSetting("google_refresh_token"),
    getSetting("gmail_user_email"),
    supabase
      .from("phases")
      .select("id, name, project_id, status, start_date, end_date"),
    supabase
      .from("tasks")
      .select("id, title, due_date, project_id")
      .not("due_date", "is", null),
  ]);

  const initialFilterAddresses: string[] = filterRaw ? JSON.parse(filterRaw) : [];
  const calendarConnected = !!calendarToken;
  const phases = phasesResult.data;
  const tasks = tasksResult.data;

  const projectsList = projects.map((p) => ({
    id: p.id,
    title: p.title,
    client: p.client,
    color: p.color,
  }));

  const phasesList = (phases ?? []).map((ph) => ({
    id: ph.id,
    name: ph.name,
    project_id: ph.project_id,
    status: ph.status,
    start_date: ph.start_date ?? null,
    end_date: ph.end_date ?? null,
  }));

  const tasksList = (tasks ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    due_date: t.due_date ?? null,
    project_id: t.project_id ?? null,
  }));

  return (
    <EmailClient
      initialEmails={emails}
      initialTaskSuggestions={taskSuggestions}
      projects={projectsList}
      phases={phasesList}
      tasks={tasksList}
      hasToneProfile={hasToneProfile}
      initialFilterAddresses={initialFilterAddresses}
      calendarConnected={calendarConnected}
      userEmail={userEmail ?? ""}
    />
  );
}
