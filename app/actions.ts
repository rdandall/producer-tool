"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PhaseStatus } from "@/lib/db/projects";
import { getSetting, setSetting } from "@/lib/db/settings";

// ── Task actions ──────────────────────────────────────────────────────────

export async function toggleTaskAction(taskId: string, completed: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ completed })
    .eq("id", taskId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard", "layout");
}

export async function createTaskAction(formData: FormData) {
  const supabase = await createClient();

  const title = (formData.get("title") as string)?.trim();
  if (!title) throw new Error("Task title is required");

  const rawProjectId = formData.get("project_id") as string;
  const rawDueDate   = formData.get("due_date")   as string;

  const { error } = await supabase.from("tasks").insert({
    title,
    project_id: rawProjectId || null,
    due_date:   rawDueDate   || null,
    priority:  (formData.get("priority") as string) || "medium",
    completed:  false,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard", "layout");
}

export async function updateTaskAction(
  taskId: string,
  updates: {
    title?: string;
    priority?: string;
    project_id?: string | null;
    due_date?: string | null;
    assigned_to?: string | null;
    links?: Array<{ label: string; url: string }>;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update(updates).eq("id", taskId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard", "layout");
}

export async function deleteTaskAction(taskId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard", "layout");
}

export async function createTaskDirectAction(params: {
  title: string;
  project_id?: string | null;
  due_date?: string | null;
  priority?: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    title: params.title,
    project_id: params.project_id ?? null,
    due_date: params.due_date ?? null,
    priority: params.priority ?? "medium",
    completed: false,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard", "layout");
}

// ── Project actions ───────────────────────────────────────────────────────

export async function createProjectAction(formData: FormData) {
  const supabase = await createClient();

  const title = (formData.get("title") as string)?.trim();
  if (!title) throw new Error("Project title is required");

  const rawDueDate     = formData.get("due_date")      as string;
  const rawFrameio     = formData.get("frameio_link")  as string;
  const rawEditorName  = formData.get("editor_name")   as string;
  const rawEditorEmail = formData.get("editor_email")  as string;
  const rawClientEmail = formData.get("client_email")  as string;
  const rawBrief       = formData.get("brief")         as string;
  const rawClient      = formData.get("client")        as string;
  const rawOngoing     = formData.get("ongoing")       as string;

  const ongoing = rawOngoing === "on" || rawOngoing === "true";

  const { data, error } = await supabase
    .from("projects")
    .insert({
      title,
      client:       rawClient      || null,
      status:      (formData.get("status") as string) || "idea",
      brief:        rawBrief       || null,
      due_date:     ongoing ? null : (rawDueDate || null),
      ongoing,
      color:       (formData.get("color")  as string) || "#3b82f6",
      frameio_link: rawFrameio     || null,
      editor_name:  rawEditorName  || null,
      editor_email: rawEditorEmail || null,
      client_email: rawClientEmail || null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/projects/${data.id}`);
}

export async function deleteProjectAction(projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/projects");
}

export async function updateProjectBriefAction(projectId: string, brief: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ brief })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard", "layout");
}

// ── Phase actions ─────────────────────────────────────────────────────────

export async function createPhaseAction(formData: FormData) {
  const supabase = await createClient();

  const projectId = (formData.get("project_id") as string)?.trim();
  const name      = (formData.get("name")       as string)?.trim();
  if (!projectId || !name) throw new Error("Project and phase name are required");

  const rawStartDate = formData.get("start_date") as string;
  if (!rawStartDate) throw new Error("Start date is required");

  const rawEndDate = formData.get("end_date") as string;
  const rawNotes   = formData.get("notes")    as string;

  const { error } = await supabase.from("phases").insert({
    project_id: projectId,
    name,
    status:    (formData.get("status") as PhaseStatus) || "upcoming",
    start_date: rawStartDate,
    end_date:   rawEndDate || null,
    notes:      rawNotes   || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard", "layout");
}

export async function updatePhaseStatusAction(phaseId: string, status: PhaseStatus) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("phases")
    .update({ status })
    .eq("id", phaseId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard", "layout");
}

export async function deletePhaseAction(phaseId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("phases").delete().eq("id", phaseId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard", "layout");
}

// ── Note actions ──────────────────────────────────────────────────────────

import type { NoteType, NoteLink, ExtractedTask } from "@/lib/db/notes";

export async function createNoteAction(fields: {
  title?: string;
  type?: NoteType;
  raw_input?: string;
  content?: string;
  project_id?: string | null;
}): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notes")
    .insert({
      title:      fields.title      ?? "Untitled Note",
      type:       fields.type       ?? "notes",
      raw_input:  fields.raw_input  ?? "",
      content:    fields.content    ?? null,
      project_id: fields.project_id ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard", "layout");
  return data.id;
}

export async function updateNoteAction(
  noteId: string,
  updates: {
    title?: string;
    type?: NoteType;
    raw_input?: string;
    content?: string;
    project_id?: string | null;
    links?: NoteLink[];
    extracted_tasks?: ExtractedTask[];
  }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notes")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", noteId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard", "layout");
}

export async function deleteNoteAction(noteId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("notes").delete().eq("id", noteId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard", "layout");
}

// ── Email task suggestion actions ──────────────────────────────────────────────

/** Approve an email task suggestion: creates the task and marks suggestion approved */
export async function approveEmailTaskSuggestionAction(
  suggestionId: string,
  task: {
    title: string;
    priority: string;
    project_id: string | null;
    due_date: string | null;
  }
) {
  const supabase = await createClient();

  await Promise.all([
    supabase.from("tasks").insert({
      title: task.title,
      priority: task.priority || "medium",
      project_id: task.project_id || null,
      due_date: task.due_date || null,
      completed: false,
    }),
    supabase
      .from("email_task_suggestions")
      .update({ status: "approved" })
      .eq("id", suggestionId),
  ]);

  revalidatePath("/dashboard", "layout");
}

/** Dismiss an email task suggestion without creating a task */
export async function dismissEmailTaskSuggestionAction(suggestionId: string) {
  const supabase = await createClient();
  await supabase
    .from("email_task_suggestions")
    .update({ status: "dismissed" })
    .eq("id", suggestionId);
  revalidatePath("/dashboard/email");
}

// ── Settings actions ───────────────────────────────────────────────────────

async function getCurrentSitePassword(): Promise<string> {
  const dbPw = await getSetting("site_password");
  return dbPw || process.env.SITE_PASSWORD || "thevision";
}

/** Increment session_version so all existing cookies become invalid. */
export async function invalidateAllSessionsAction(password: string): Promise<void> {
  const sitePassword = await getCurrentSitePassword();
  if (password !== sitePassword) throw new Error("Incorrect password");

  const current = parseInt((await getSetting("session_version")) ?? "1", 10) || 1;
  await setSetting("session_version", String(current + 1));
  // Caller is responsible for redirecting to /login after this completes
}

/** Change the site-wide access password (stored in DB). */
export async function changeSitePasswordAction(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const sitePassword = await getCurrentSitePassword();
  if (currentPassword !== sitePassword) throw new Error("Incorrect current password");
  if (!newPassword || newPassword.trim().length < 4)
    throw new Error("New password must be at least 4 characters");

  await setSetting("site_password", newPassword.trim());
  revalidatePath("/dashboard/settings");
}

/** Set the number of emails to fetch per sync (10–500). */
export async function setEmailSyncLimitAction(limit: number): Promise<void> {
  if (limit < 10 || limit > 500) throw new Error("Limit must be between 10 and 500");
  await setSetting("email_sync_limit", String(limit));
  revalidatePath("/dashboard/settings");
}

/** Set the default document type for new notes. */
export async function setNoteDefaultTypeAction(type: string): Promise<void> {
  const validTypes = ["brief", "meeting-notes", "project-notes", "client-brief"];
  if (!validTypes.includes(type)) throw new Error("Invalid document type");
  await setSetting("note_default_type", type);
  revalidatePath("/dashboard/settings");
}

/** Set the Resend "from" address for note email exports. */
export async function setEmailFromAddressAction(address: string): Promise<void> {
  if (!address.trim()) throw new Error("Email address is required");
  await setSetting("email_from_address", address.trim());
  revalidatePath("/dashboard/settings");
}

/** Save the AI writing style note. */
export async function saveStyleNoteAction(note: string): Promise<void> {
  await setSetting("gmail_style_note", note.trim());
  revalidatePath("/dashboard/settings");
}

/** Clear the Gmail AI tone profile (forces re-analysis next time). */
export async function clearToneProfileAction(): Promise<void> {
  await Promise.all([
    setSetting("gmail_tone_profile", ""),
    setSetting("gmail_tone_sample_count", ""),
  ]);
  revalidatePath("/dashboard/settings");
}

/** Disconnect Gmail by clearing all stored tokens. */
export async function disconnectGmailAction(): Promise<void> {
  await Promise.all([
    setSetting("gmail_access_token", ""),
    setSetting("gmail_refresh_token", ""),
    setSetting("gmail_token_expiry", ""),
    setSetting("gmail_user_email", ""),
  ]);
  revalidatePath("/dashboard", "layout");
}

/** Disconnect Google Calendar by clearing all stored tokens. */
export async function disconnectCalendarAction(): Promise<void> {
  await Promise.all([
    setSetting("google_access_token", ""),
    setSetting("google_refresh_token", ""),
    setSetting("google_token_expiry", ""),
  ]);
  revalidatePath("/dashboard", "layout");
}
