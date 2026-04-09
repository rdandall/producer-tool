import { getAllNotes } from "@/lib/db/notes";
import { getProjects } from "@/lib/db/projects";
import { getSetting } from "@/lib/db/settings";
import { NotesClient } from "@/components/notes/notes-client";
import type { NoteType } from "@/lib/db/notes";

export default async function NotesPage() {
  const [notes, projects, defaultDocType] = await Promise.all([
    getAllNotes(),
    getProjects(),
    getSetting("note_default_type"),
  ]);

  const projectsList = projects.map((p) => ({
    id: p.id,
    title: p.title,
    client: p.client,
  }));

  return (
    <NotesClient
      initialNotes={notes}
      projects={projectsList}
      defaultDocType={(defaultDocType as NoteType) ?? "brief"}
    />
  );
}
