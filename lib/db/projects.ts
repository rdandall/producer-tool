import { createClient } from "@/lib/supabase/server";

export type ProjectStatus =
  | "idea" | "pre-production" | "filming" | "editing" | "review" | "delivered";

export type EditStatus =
  | "not-started" | "in-progress" | "draft-sent" | "changes-requested" | "approved";

export type PhaseStatus = "upcoming" | "active" | "complete";

export interface EditVersion {
  id: string;
  project_id: string;
  version: number;
  label: string;
  status: EditStatus;
  sent_at: string | null;
  notes: string | null;
  frameio_link: string | null;
  created_at: string;
}

export interface Phase {
  id: string;
  project_id: string;
  name: string;
  status: PhaseStatus;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface DbTask {
  id: string;
  title: string;
  completed: boolean;
  project_id: string | null;
  due_date: string | null;
  priority: "high" | "medium" | "low";
  created_at: string;
}

export interface Project {
  id: string;
  title: string;
  client: string | null;
  client_id: string | null;
  status: ProjectStatus;
  brief: string | null;
  due_date: string | null;
  ongoing: boolean;
  frameio_link: string | null;
  drive_link: string | null;
  editor_name: string | null;
  editor_email: string | null;
  client_email: string | null;
  color: string;
  created_at: string;
  edit_versions?: EditVersion[];
  phases?: Phase[];
  tasks?: DbTask[];
}

export async function getProjects(): Promise<Project[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*, edit_versions(*), phases(*), tasks(*)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getProjects:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getProject(id: string): Promise<Project | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*, edit_versions(*), phases(*), tasks(*)")
    .eq("id", id)
    .single();

  if (error) {
    console.error("getProject:", error.message);
    return null;
  }
  return data;
}
