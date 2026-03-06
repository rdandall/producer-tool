"use client";

import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp, GitBranch, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { StoredEmail } from "@/lib/db/emails";

interface DateConflict {
  mentionedDate: string;
  mentionedContext: string;
  conflictType: "phase" | "task" | "calendar";
  conflictName: string;
  conflictDetails: string;
}

interface PhaseSignal {
  detected: boolean;
  description: string;
  suggestedAction: string;
  phaseId: string | null;
}

interface EmailThreadPanelProps {
  messages: StoredEmail[];
  dateConflicts: DateConflict[];
  phaseSignal: PhaseSignal | null;
  onDismissConflicts: () => void;
  onDismissPhaseSignal: () => void;
  onPhaseAction: (phaseId: string | null, action: string) => void;
  onReply: () => void;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EmailMessage({
  email,
  isLatest,
}: {
  email: StoredEmail;
  isLatest: boolean;
}) {
  const [expanded, setExpanded] = useState(isLatest);
  const displayName = email.from_name || email.from_email;

  return (
    <div className={cn("border-b border-border/50", !expanded && "cursor-pointer")}>
      {/* Message header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-sidebar-accent/30 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 flex items-center justify-center bg-sidebar-accent text-[10px] font-bold text-foreground shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <span className="text-xs font-medium text-foreground">{displayName}</span>
            {!expanded && (
              <span className="text-xs text-muted-foreground ml-2 truncate">
                {email.snippet}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground">
            {formatTime(email.received_at)}
          </span>
          {expanded ? (
            <ChevronUp className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Message body */}
      {expanded && (
        <div className="px-4 pb-4">
          <div className="text-[10px] text-muted-foreground mb-3">
            <span>To: {email.to_emails.join(", ")}</span>
          </div>
          <div className="text-xs text-foreground leading-relaxed whitespace-pre-wrap font-mono bg-sidebar-accent/20 p-3">
            {email.body_text || email.snippet || "(No content)"}
          </div>
        </div>
      )}
    </div>
  );
}

export function EmailThreadPanel({
  messages,
  dateConflicts,
  phaseSignal,
  onDismissConflicts,
  onDismissPhaseSignal,
  onPhaseAction,
  onReply,
}: EmailThreadPanelProps) {
  if (!messages.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Select an email to read the thread
        </p>
      </div>
    );
  }

  const subject = messages[0]?.subject ?? "(No subject)";
  const latestIdx = messages.length - 1;

  return (
    <div className="flex flex-col h-full">
      {/* Thread subject header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold text-foreground truncate">{subject}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {messages.length} message{messages.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Banners */}
      <div className="shrink-0">
        {/* Date conflict warning */}
        {dateConflicts.length > 0 && (
          <div className="mx-4 mt-3 border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-400">
                    Date conflict{dateConflicts.length > 1 ? "s" : ""} detected
                  </p>
                  <ul className="mt-1 space-y-1">
                    {dateConflicts.map((c, i) => (
                      <li key={i} className="text-[11px] text-amber-400/80">
                        <span className="font-medium">{c.mentionedDate}</span>
                        {" conflicts with "}
                        <span className="font-medium">{c.conflictName}</span>
                        {" — "}
                        <span className="opacity-70">{c.conflictDetails}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <button
                onClick={onDismissConflicts}
                className="text-amber-400/60 hover:text-amber-400 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Phase suggestion */}
        {phaseSignal?.detected && (
          <div className="mx-4 mt-3 border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <GitBranch className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-primary">Phase update suggested</p>
                  <p className="text-[11px] text-primary/80 mt-0.5">
                    {phaseSignal.description}
                  </p>
                  <button
                    onClick={() => onPhaseAction(phaseSignal.phaseId, phaseSignal.suggestedAction)}
                    className="mt-2 text-[11px] text-primary border border-primary/30 px-2 py-1 hover:bg-primary/10 transition-colors flex items-center gap-1"
                  >
                    {phaseSignal.suggestedAction}
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <button
                onClick={onDismissPhaseSignal}
                className="text-primary/60 hover:text-primary transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto mt-3">
        {messages.map((msg, i) => (
          <EmailMessage key={msg.id} email={msg} isLatest={i === latestIdx} />
        ))}
      </div>

      {/* Reply button */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        <button
          onClick={onReply}
          className="flex items-center gap-2 text-xs font-medium text-foreground border border-border px-4 py-2 hover:bg-sidebar-accent transition-colors"
        >
          Reply with AI
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
