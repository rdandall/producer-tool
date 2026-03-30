import { getPendingTaskSuggestions, getAllEmails, getExistingEmailIds, upsertEmails } from "@/lib/db/emails";
import { getSetting } from "@/lib/db/settings";
import { getGmailMessagesByIds, getValidGmailToken, listInboxMessageIds } from "@/lib/gmail";

export interface EmailSyncError {
  type: "fetch" | "upsert";
  id?: string;
  error: string;
}

export interface EmailSyncResult {
  synced: number;
  total: number;
  emails: Awaited<ReturnType<typeof getAllEmails>>;
  taskSuggestions: Awaited<ReturnType<typeof getPendingTaskSuggestions>>;
  syncErrors: EmailSyncError[];
}

async function getEmailSyncLimit(): Promise<number> {
  const raw = await getSetting("email_sync_limit");
  const parsed = Number.parseInt(raw ?? "50", 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(500, Math.max(10, parsed));
}

export async function syncInboxEmails(): Promise<EmailSyncResult> {
  const token = await getValidGmailToken();
  if (!token) {
    throw new Error("Not connected to Gmail");
  }

  const maxResults = await getEmailSyncLimit();
  const syncErrors: EmailSyncError[] = [];
  const messageIds = await listInboxMessageIds(token, maxResults);

  if (messageIds.length > 0) {
    const existingIds = await getExistingEmailIds(messageIds);
    const existingSet = new Set(existingIds);
    const missingIds = messageIds.filter((id) => !existingSet.has(id));

    if (missingIds.length > 0) {
      const { messages, errors } = await getGmailMessagesByIds(token, missingIds);
      syncErrors.push(...errors.map((error) => ({ ...error, type: "fetch" as const })));

      if (messages.length > 0) {
        const upsertResult = await upsertEmails(messages);
        syncErrors.push(
          ...upsertResult.errors.map((error) => ({ ...error, type: "upsert" as const, id: error.gmail_message_id }))
        );

        const [emails, taskSuggestions] = await Promise.all([
          getAllEmails(),
          getPendingTaskSuggestions(),
        ]);

        return {
          synced: upsertResult.newCount,
          total: messageIds.length,
          emails,
          taskSuggestions,
          syncErrors,
        };
      }
    }
  }

  const [emails, taskSuggestions] = await Promise.all([
    getAllEmails(),
    getPendingTaskSuggestions(),
  ]);

  return {
    synced: 0,
    total: messageIds.length,
    emails,
    taskSuggestions,
    syncErrors,
  };
}
