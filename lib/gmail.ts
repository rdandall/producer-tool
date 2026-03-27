/** Gmail REST API helpers — direct fetch, no SDK needed. */

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AttachmentMetadata {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  from: { email: string; name: string };
  to: string[];
  subject: string;
  snippet: string;
  bodyText: string;
  bodyHtml: string;
  receivedAt: string;
  isRead: boolean;
  isSent: boolean;
  labels: string[];
  attachments: AttachmentMetadata[];
  messageId?: string; // RFC 2822 Message-ID header (for threading)
}

// ── OAuth ─────────────────────────────────────────────────────────────────────

export function getGmailAuthUrl(redirectUri: string, state?: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  if (state) params.set("state", state);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGmailCode(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? "Gmail token exchange failed");
  return data;
}

export async function refreshGmailToken(refreshToken: string): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? "Gmail token refresh failed");
  return data.access_token;
}

/** Get a valid Gmail access token, refreshing if expired. */
export async function getValidGmailToken(): Promise<string | null> {
  // Import here to avoid circular deps — this runs server-side only
  const { getSetting, setSetting } = await import("@/lib/db/settings");

  const [accessToken, expiry, refreshToken] = await Promise.all([
    getSetting("gmail_access_token"),
    getSetting("gmail_token_expiry"),
    getSetting("gmail_refresh_token"),
  ]);

  if (!refreshToken) return null;

  // Use cached token if still valid (with 60s buffer)
  if (accessToken && expiry && Date.now() < parseInt(expiry) - 60_000) {
    return accessToken;
  }

  const newToken = await refreshGmailToken(refreshToken);
  await Promise.all([
    setSetting("gmail_access_token", newToken),
    setSetting("gmail_token_expiry", String(Date.now() + 3_600_000)),
  ]);
  return newToken;
}

// ── Parsing helpers ───────────────────────────────────────────────────────────

function decodeBase64Url(data: string): string {
  try {
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function getHeader(
  headers: Array<{ name: string; value: string }>,
  name: string
): string {
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ""
  );
}

function parseEmailAddress(raw: string): { email: string; name: string } {
  const match = raw.match(/^(.*?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim().replace(/"/g, ""), email: match[2].trim() };
  }
  return { email: raw.trim(), name: "" };
}

function extractBody(payload: Record<string, unknown>): { text: string; html: string; attachments: AttachmentMetadata[] } {
  if (!payload) return { text: "", html: "", attachments: [] };

  const mimeType = payload.mimeType as string | undefined;
  const body = payload.body as { data?: string; attachmentId?: string; size?: number } | undefined;
  const filename = payload.filename as string | undefined;
  const parts = payload.parts as Array<Record<string, unknown>> | undefined;

  // This part is an attachment (has a filename and an attachmentId, no inline data)
  if (filename && filename.length > 0 && body?.attachmentId) {
    return {
      text: "",
      html: "",
      attachments: [{
        filename,
        mimeType: mimeType || "application/octet-stream",
        attachmentId: body.attachmentId,
        size: body.size ?? 0,
      }],
    };
  }

  // Inline content
  if (body?.data) {
    const decoded = decodeBase64Url(body.data);
    if (mimeType === "text/plain") return { text: decoded, html: "", attachments: [] };
    if (mimeType === "text/html") return { text: "", html: decoded, attachments: [] };
  }

  // Multipart — recurse into parts
  if (parts) {
    let text = "";
    let html = "";
    const attachments: AttachmentMetadata[] = [];
    for (const part of parts) {
      const extracted = extractBody(part);
      if (extracted.text) text = extracted.text;
      if (extracted.html) html = extracted.html;
      attachments.push(...extracted.attachments);
    }
    return { text, html, attachments };
  }

  return { text: "", html: "", attachments: [] };
}

function parseMessage(raw: Record<string, unknown>): GmailMessage {
  const payload = raw.payload as Record<string, unknown> | undefined;
  const headers: Array<{ name: string; value: string }> =
    (payload?.headers as Array<{ name: string; value: string }>) ?? [];

  const from = parseEmailAddress(getHeader(headers, "From"));
  const toRaw = getHeader(headers, "To");
  const to = toRaw ? toRaw.split(",").map((s) => s.trim()) : [];
  const subject = getHeader(headers, "Subject");
  const messageId = getHeader(headers, "Message-ID");

  const { text: bodyText, html: bodyHtml, attachments } = extractBody(payload ?? {});
  const labels: string[] = (raw.labelIds as string[]) ?? [];

  // Prefer internalDate (when Gmail actually received the message, in ms since epoch)
  // over the Date header (when the sender claims to have sent it — often wrong for newsletters)
  const internalDateMs = raw.internalDate as string | undefined;
  const dateHeader = getHeader(headers, "Date");
  let receivedAt: string;
  if (internalDateMs) {
    receivedAt = new Date(parseInt(internalDateMs, 10)).toISOString();
  } else if (dateHeader) {
    receivedAt = new Date(dateHeader).toISOString();
  } else {
    receivedAt = new Date().toISOString();
  }

  return {
    id: raw.id as string,
    threadId: raw.threadId as string,
    from,
    to,
    subject: subject || "(No subject)",
    snippet: (raw.snippet as string) ?? "",
    bodyText,
    bodyHtml,
    receivedAt,
    isRead: !labels.includes("UNREAD"),
    isSent: labels.includes("SENT"),
    labels,
    attachments,
    messageId: messageId || undefined,
  };
}

// ── Gmail API calls ───────────────────────────────────────────────────────────

export async function listInboxMessages(
  accessToken: string,
  maxResults = 100
): Promise<GmailMessage[]> {
  // Use labelIds=INBOX (direct label filter) rather than q="in:inbox" (search query)
  // — more reliable and faster; results come back sorted by internalDate descending
  const listRes = await fetch(
    `${GMAIL_BASE}/messages?` +
      new URLSearchParams({ labelIds: "INBOX", maxResults: String(maxResults) }),
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) {
    const errBody = await listRes.json().catch(() => ({}));
    throw new Error(`Failed to list Gmail messages: ${errBody?.error?.message ?? listRes.status}`);
  }
  const listData = await listRes.json();
  const ids: string[] = (listData.messages ?? []).map((m: { id: string }) => m.id);
  if (!ids.length) return [];

  // Fetch full message details in parallel; skip any that fail individually
  const results = await Promise.allSettled(
    ids.map((id) =>
      fetch(`${GMAIL_BASE}/messages/${id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((r) => {
        if (!r.ok) throw new Error(`Message ${id} fetch failed: ${r.status}`);
        return r.json();
      })
    )
  );

  return results
    .filter((r): r is PromiseFulfilledResult<Record<string, unknown>> => r.status === "fulfilled")
    .map((r) => parseMessage(r.value));
}

export async function getGmailThread(
  accessToken: string,
  threadId: string
): Promise<GmailMessage[]> {
  const res = await fetch(`${GMAIL_BASE}/threads/${threadId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch thread");
  const data = await res.json();
  return ((data.messages ?? []) as Record<string, unknown>[]).map(parseMessage);
}

export async function searchSentEmails(
  accessToken: string,
  maxResults = 150
): Promise<GmailMessage[]> {
  const listRes = await fetch(
    `${GMAIL_BASE}/messages?` +
      new URLSearchParams({ q: "in:sent", maxResults: String(maxResults) }),
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) throw new Error("Failed to fetch sent emails");
  const listData = await listRes.json();
  const ids: string[] = (listData.messages ?? []).map((m: { id: string }) => m.id);
  if (!ids.length) return [];

  // Batch in groups of 10 to avoid rate limits
  const messages: GmailMessage[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10);
    const batchMessages = await Promise.all(
      batch.map((id) =>
        fetch(`${GMAIL_BASE}/messages/${id}?format=full`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }).then((r) => r.json())
      )
    );
    messages.push(...batchMessages.map((m) => parseMessage(m as Record<string, unknown>)));
  }
  return messages;
}

// ── Signature ─────────────────────────────────────────────────────────────────

/** Fetch the default Gmail signature (HTML string) for the authed account. */
export async function getGmailSignature(accessToken: string): Promise<string> {
  try {
    const res = await fetch(`${GMAIL_BASE}/settings/sendAs`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return "";
    const data = await res.json();
    const entries: Array<{ isDefault?: boolean; isPrimary?: boolean; signature?: string }> =
      data.sendAs ?? [];
    const entry =
      entries.find((e) => e.isDefault) ??
      entries.find((e) => e.isPrimary) ??
      entries[0];
    return entry?.signature ?? "";
  } catch {
    return "";
  }
}

export async function sendGmailReply(
  accessToken: string,
  options: {
    to: string;
    cc?: string[];
    subject: string;
    body: string;
    threadId?: string;
    inReplyTo?: string;
    references?: string;
    fromEmail: string;
    isHtml?: boolean;
    attachments?: Array<{ filename: string; mimeType: string; data: string }>; // base64
  }
): Promise<void> {
  const { to, cc, subject, body, threadId, inReplyTo, references, fromEmail, isHtml, attachments } = options;
  // For new emails (no threadId), don't force the "Re:" prefix
  const subjectLine =
    threadId && !subject.startsWith("Re:") && !subject.startsWith("Fwd:")
      ? `Re: ${subject}`
      : subject;
  const contentType = isHtml ? "text/html" : "text/plain";

  let rawEmail: string;

  if (attachments && attachments.length > 0) {
    const boundary = `boundary_${Date.now()}`;
    const lines = [
      `From: ${fromEmail}`,
      `To: ${to}`,
      ...(cc && cc.length > 0 ? [`Cc: ${cc.join(", ")}`] : []),
      `Subject: ${subjectLine}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ];
    if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
    if (references) lines.push(`References: ${references}`);
    lines.push("", `--${boundary}`);
    lines.push(`Content-Type: ${contentType}; charset=UTF-8`, "", body);
    for (const att of attachments) {
      lines.push(
        `--${boundary}`,
        `Content-Type: ${att.mimeType}; name="${att.filename}"`,
        `Content-Disposition: attachment; filename="${att.filename}"`,
        `Content-Transfer-Encoding: base64`,
        "",
        att.data
      );
    }
    lines.push(`--${boundary}--`);
    rawEmail = lines.join("\r\n");
  } else {
    const emailLines = [
      `From: ${fromEmail}`,
      `To: ${to}`,
      ...(cc && cc.length > 0 ? [`Cc: ${cc.join(", ")}`] : []),
      `Subject: ${subjectLine}`,
      `MIME-Version: 1.0`,
      `Content-Type: ${contentType}; charset=UTF-8`,
    ];
    if (inReplyTo) emailLines.push(`In-Reply-To: ${inReplyTo}`);
    if (references) emailLines.push(`References: ${references}`);
    emailLines.push("", body);
    rawEmail = emailLines.join("\r\n");
  }

  const encodedEmail = Buffer.from(rawEmail).toString("base64url");

  const res = await fetch(`${GMAIL_BASE}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(threadId ? { raw: encodedEmail, threadId } : { raw: encodedEmail }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message ?? "Failed to send email");
  }
}
