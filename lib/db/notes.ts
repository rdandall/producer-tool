import { createClient } from "@/lib/supabase/server";

export type NoteType = "brief" | "meeting-notes" | "project-notes" | "client-brief";

export interface NoteLink {
  label: string;
  url: string;
}

export interface ExtractedTask {
  title: string;
  assignedTo: string | null;
  priority: "high" | "medium" | "low";
  dueHint: string | null;
}

export interface Note {
  id: string;
  title: string;
  type: NoteType;
  raw_input: string;
  content: string | null;
  project_id: string | null;
  links: NoteLink[];
  extracted_tasks: ExtractedTask[];
  created_at: string;
  updated_at: string;
  projects: {
    id: string;
    title: string;
    client: string | null;
    color: string;
  } | null;
}

export async function getAllNotes(): Promise<Note[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notes")
    .select("*, projects(id, title, client, color)")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("getAllNotes:", error.message);
    return [];
  }
  return (data ?? []).map((n) => ({
    ...n,
    links: Array.isArray(n.links) ? n.links : [],
    extracted_tasks: Array.isArray(n.extracted_tasks) ? n.extracted_tasks : [],
  }));
}

export async function getNoteById(id: string): Promise<Note | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notes")
    .select("*, projects(id, title, client, color)")
    .eq("id", id)
    .single();

  if (error) return null;
  return {
    ...data,
    links: Array.isArray(data.links) ? data.links : [],
    extracted_tasks: Array.isArray(data.extracted_tasks) ? data.extracted_tasks : [],
  };
}
