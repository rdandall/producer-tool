import { getAllNotes } from "@/lib/db/notes";
import { getProjects } from "@/lib/db/projects";
import { NotesClient } from "@/components/notes/notes-client";

export default async function NotesPage() {
  const [notes, projects] = await Promise.all([getAllNotes(), getProjects()]);

  return (
    <NotesClient
      initialNotes={notes}
      projects={projects.map((p) => ({
        id: p.id,
        title: p.title,
        client: p.client,
      }))}
    />
  );
}
