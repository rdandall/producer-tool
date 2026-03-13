import { createClient } from "@/lib/supabase/server";

export interface Client {
  id: string;
  name: string;
  color: string;
  contact_name: string | null;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
}

export interface ClientWithProjects extends Client {
  projects: Array<{
    id: string;
    title: string;
    status: string;
    color: string;
    due_date: string | null;
    ongoing: boolean;
    created_at: string;
  }>;
}

export async function getAllClients(): Promise<ClientWithProjects[]> {
  const supabase = await createClient();

  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("*")
    .order("name", { ascending: true });

  if (clientsError) {
    console.error("getAllClients:", clientsError.message);
    return [];
  }

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, title, status, color, due_date, ongoing, created_at, client_id")
    .order("created_at", { ascending: false });

  if (projectsError) {
    console.error("getAllClients projects:", projectsError.message);
    return (clients ?? []).map((c) => ({ ...c, projects: [] }));
  }

  return (clients ?? []).map((c) => ({
    ...c,
    projects: (projects ?? [])
      .filter((p) => p.client_id === c.id)
      .map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        color: p.color,
        due_date: p.due_date,
        ongoing: p.ongoing,
        created_at: p.created_at,
      })),
  }));
}

export async function getClient(id: string): Promise<ClientWithProjects | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("getClient:", error.message);
    return null;
  }

  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, status, color, due_date, ongoing, created_at")
    .eq("client_id", id)
    .order("created_at", { ascending: false });

  return {
    ...data,
    projects: (projects ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      color: p.color,
      due_date: p.due_date,
      ongoing: p.ongoing,
      created_at: p.created_at,
    })),
  };
}
