import { createClient } from "@/lib/supabase/server";

export interface TaskLink {
  label: string;
  url: string;
}

export interface TaskWithProject {
  id: string;
  title: string;
  completed: boolean;
  project_id: string | null;
  due_date: string | null;
  priority: "high" | "medium" | "low";
  assigned_to: string | null;
  links: TaskLink[];
  created_at: string;
  projects: {
    id: string;
    title: string;
    client: string | null;
    color: string;
  } | null;
}

export async function getAllTasks(): Promise<TaskWithProject[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*, projects(id, title, client, color)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getAllTasks:", error.message);
    return [];
  }
  return (data ?? []).map((t) => ({
    ...t,
    links: Array.isArray(t.links) ? t.links : [],
  }));
}
