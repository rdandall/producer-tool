import { createClient } from "@/lib/supabase/server";
import type { GmailMessage, AttachmentMetadata } from "@/lib/gmail";

export type { AttachmentMetadata };

export interface StoredEmail {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  from_email: string;
  from_name: string | null;
  to_emails: string[];
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
  body_html: string | null;
  received_at: string | null;
  is_read: boolean;
  is_sent: boolean;
  labels: string[];
  attachments: AttachmentMetadata[];
  project_id: string | null;
  created_at: string;
}

export interface EmailTaskSuggestion {
  id: string;
  email_id: string;
  title: string;
  priority: "high" | "medium" | "low";
  project_id: string | null;
  due_hint: string | null;
  status: "pending" | "approved" | "dismissed";
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeEmail(raw: any): StoredEmail {
  return {
    ...raw,
    to_emails: Array.isArray(raw.to_emails) ? raw.to_emails : [],
    labels: Array.isArray(raw.labels) ? raw.labels : [],
    attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
  } as StoredEmail;
}

export async function getAllEmails(): Promise<StoredEmail[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("emails")
    .select("*")
    .order("received_at", { ascending: false })
    .limit(300);

  if (error) {
    console.error("getAllEmails:", error.message);
    return [];
  }
  return (data ?? []).map((e) => normalizeEmail(e as Record<string, unknown>));
}

/** Upsert messages and return the number that are genuinely new (not previously synced). */
export async function upsertEmails(messages: GmailMessage[]): Promise<number> {
  if (!messages.length) return 0;
  const supabase = await createClient();

  // Determine which IDs are already in the DB so we can return an accurate new-count
  const incomingIds = messages.map((m) => m.id);
  const { data: existing } = await supabase
    .from("emails")
    .select("gmail_message_id")
    .in("gmail_message_id", incomingIds);
  const existingSet = new Set((existing ?? []).map((r) => r.gmail_message_id as string));
  const newCount = messages.filter((m) => !existingSet.has(m.id)).length;

  const rows = messages.map((m) => ({
    gmail_message_id: m.id,
    gmail_thread_id: m.threadId,
    from_email: m.from.email,
    from_name: m.from.name || null,
    to_emails: m.to,
    subject: m.subject,
    snippet: m.snippet,
    body_text: m.bodyText,
    body_html: m.bodyHtml,
    received_at: m.receivedAt,
    is_read: m.isRead,
    is_sent: m.isSent,
    labels: m.labels,
    attachments: m.attachments,
  }));

  const { error } = await supabase
    .from("emails")
    .upsert(rows, { onConflict: "gmail_message_id", ignoreDuplicates: false });

  if (error) throw new Error(`Email upsert failed: ${error.message}`);

  return newCount;
}

export async function getPendingTaskSuggestions(): Promise<EmailTaskSuggestion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_task_suggestions")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as EmailTaskSuggestion[];
}

export async function insertTaskSuggestions(
  suggestions: Array<{
    email_id: string;
    title: string;
    priority: string;
    project_id?: string | null;
    due_hint?: string | null;
  }>
): Promise<void> {
  if (!suggestions.length) return;
  const supabase = await createClient();
  await supabase.from("email_task_suggestions").insert(suggestions);
}

export async function updateTaskSuggestionStatus(
  id: string,
  status: "approved" | "dismissed"
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("email_task_suggestions")
    .update({ status })
    .eq("id", id);
}
