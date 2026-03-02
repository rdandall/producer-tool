"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PhaseStatus } from "@/lib/db/projects";

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
