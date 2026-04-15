import { createClient } from "@/lib/supabase/server";
import type { Note, NoteAttachment, NoteVersion } from "./notes-types";

// Re-export all types and helpers so existing server-side imports keep working
export type {
  NoteType,
  NoteStatus,
  AttachmentRole,
  VersionTrigger,
  NoteLink,
  ExtractedTask,
  NoteAttachment,
  NoteVersion,
  Note,
} from "./notes-types";
export {
  defaultRoleForMime,
  isImageMime,
  isVideoMime,
  formatBytes,
} from "./notes-types";

// ── Queries ───────────────────────────────────────────────────────────────────

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
  return (data ?? []).map(normalizeNote);
}

export async function getNoteById(id: string): Promise<Note | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notes")
    .select("*, projects(id, title, client, color)")
    .eq("id", id)
    .single();

  if (error) return null;
  return normalizeNote(data);
}

export async function getNoteAttachments(noteId: string): Promise<NoteAttachment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("note_attachments")
    .select("*")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getNoteAttachments:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getNoteVersions(noteId: string): Promise<NoteVersion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("note_versions")
    .select("*")
    .eq("note_id", noteId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("getNoteVersions:", error.message);
    return [];
  }
  return data ?? [];
}

// ── Internal ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeNote(n: any): Note {
  return {
    ...n,
    status: n.status ?? "draft",
    last_output_type: n.last_output_type ?? null,
    links: Array.isArray(n.links) ? n.links : [],
    extracted_tasks: Array.isArray(n.extracted_tasks) ? n.extracted_tasks : [],
  };
}
