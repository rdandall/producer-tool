import { createClient } from "@/lib/supabase/server";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NoteType =
  | "brief"
  | "meeting-notes"
  | "project-notes"
  | "client-brief"
  | "notes"
  | "note"
  | "quote"
  | "idea"
  | "spec"
  | "project-update";

export type NoteStatus = "draft" | "saved" | "sent";
export type AttachmentRole = "context" | "delivery" | "both";
export type VersionTrigger = "manual-save" | "send" | "export";

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

export interface NoteAttachment {
  id: string;
  note_id: string;
  storage_path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  role: AttachmentRole;
  extracted_text: string | null;
  created_at: string;
}

export interface NoteVersion {
  id: string;
  note_id: string;
  content: string;
  title: string;
  trigger: VersionTrigger;
  created_at: string;
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
  status: NoteStatus;
  last_output_type: "email" | "pdf" | "docx" | null;
  created_at: string;
  updated_at: string;
  projects: {
    id: string;
    title: string;
    client: string | null;
    color: string;
  } | null;
  attachments?: NoteAttachment[];
}

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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** Determine the default role for an uploaded file based on its MIME type. */
export function defaultRoleForMime(mimeType: string): AttachmentRole {
  // Documents / PDFs tend to be reference material → context
  if (
    mimeType === "application/pdf" ||
    mimeType.startsWith("text/") ||
    mimeType.includes("word") ||
    mimeType.includes("document")
  ) {
    return "context";
  }
  // Everything else defaults to delivery
  return "delivery";
}

/** Whether a MIME type can be previewed as an image in the browser. */
export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/** Whether a MIME type is a video. */
export function isVideoMime(mimeType: string): boolean {
  return mimeType.startsWith("video/");
}

/** Human-readable file size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
