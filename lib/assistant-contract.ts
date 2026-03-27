export const ASSISTANT_INTENTS = [
  "create_task",
  "reply_email",
  "compose_email",
  "add_calendar_event",
  "create_note",
  "navigate",
  "query_response",
  "unknown",
] as const;

export type AssistantIntent = (typeof ASSISTANT_INTENTS)[number];

export type AssistantActionParamsByIntent = {
  create_task: {
    title: string;
    project_id?: string;
    project_name?: string;
    due_date?: string;
    priority?: "low" | "medium" | "high";
    [key: string]: string | undefined;
  };
  reply_email: {
    thread_id?: string;
    sender_name?: string;
    subject_hint?: string;
    hint?: string;
    [key: string]: string | undefined;
  };
  compose_email: {
    to?: string;
    subject?: string;
    hint?: string;
    [key: string]: string | undefined;
  };
  add_calendar_event: {
    title?: string;
    date?: string;
    time?: string;
    duration?: string;
    location?: string;
    notes?: string;
    [key: string]: string | undefined;
  };
  create_note: {
    type?: "brief" | "meeting-notes" | "project-notes" | "client-brief";
    title?: string;
    project_name?: string;
    [key: string]: string | undefined;
  };
  navigate: {
    page?: string;
    path?: string;
  };
  query_response: {
    answer: string;
    [key: string]: string | undefined;
  };
  unknown: {
    message?: string;
  };
};

export type AssistantAction<T extends AssistantIntent = AssistantIntent> = {
  intent: T;
  summary: string;
  action_params: AssistantActionParamsByIntent[T];
};

export type AssistantActionPayload = {
  [K in AssistantIntent]: AssistantAction<K>;
}[AssistantIntent];

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asRecord(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof val === "string") out[key] = val;
  }
  return out;
}

export function normalizeAssistantAction(payload: unknown): AssistantActionPayload {
  const raw = payload as {
    intent?: string;
    summary?: string;
    action_params?: unknown;
  };

  const intent = ASSISTANT_INTENTS.includes(raw?.intent as AssistantIntent)
    ? (raw.intent as AssistantIntent)
    : "unknown";

  const params = asRecord(raw?.action_params) ?? {};
  const summary = safeString(raw?.summary, raw?.intent ? `Action: ${raw.intent}` : "");

  switch (intent) {
    case "create_task":
      return {
        intent,
        summary,
        action_params: {
          title: safeString(params.title, ""),
          project_id: safeString(params.project_id) || undefined,
          project_name: safeString(params.project_name) || undefined,
          due_date: safeString(params.due_date) || undefined,
          priority: safeString(params.priority, "medium") as "low" | "medium" | "high",
        },
      };
    case "reply_email":
      return {
        intent,
        summary,
        action_params: {
          thread_id: safeString(params.thread_id) || undefined,
          sender_name: safeString(params.sender_name) || undefined,
          subject_hint: safeString(params.subject_hint) || undefined,
          hint: safeString(params.hint) || undefined,
        },
      };
    case "compose_email":
      return {
        intent,
        summary,
        action_params: {
          to: safeString(params.to) || undefined,
          subject: safeString(params.subject) || undefined,
          hint: safeString(params.hint) || undefined,
        },
      };
    case "add_calendar_event":
      return {
        intent,
        summary,
        action_params: {
          title: safeString(params.title),
          date: safeString(params.date) || undefined,
          time: safeString(params.time) || undefined,
          duration: safeString(params.duration) || undefined,
          location: safeString(params.location) || undefined,
          notes: safeString(params.notes) || undefined,
        },
      };
    case "create_note":
      return {
        intent,
        summary,
        action_params: {
          type: (safeString(params.type) as "brief" | "meeting-notes" | "project-notes" | "client-brief") || "project-notes",
          title: safeString(params.title) || undefined,
          project_name: safeString(params.project_name) || undefined,
        },
      };
    case "navigate":
      return {
        intent,
        summary,
        action_params: {
          page: safeString(params.page) || undefined,
          path: safeString(params.path) || "/dashboard",
        },
      };
    case "query_response":
      return {
        intent,
        summary: summary || "Here\'s what I found.",
        action_params: {
          answer: safeString(params.answer, "I couldn't generate a response.") ,
        },
      };
    default:
      return {
        intent,
        summary: summary || "I couldn't parse that. Please try again.",
        action_params: {
          message: safeString(params.message),
        },
      };
  }
}
