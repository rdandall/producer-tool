"use client";

import {
  AlertTriangle,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Paperclip,
  X,
  Reply,
  ReplyAll,
  Forward,
  ArrowRight,
} from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { StoredEmail } from "@/lib/db/emails";
import { EmailComposePanel } from "./email-compose-panel";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DateConflict {
  mentionedDate: string;
  mentionedContext: string;
  conflictType: "phase" | "task" | "calendar";
  conflictName: string;
  conflictDetails: string;
}

interface MentionedDate {
  raw: string;
  iso: string | null;
  context: string;
}

interface PhaseSignal {
  detected: boolean;
  description: string;
  suggestedAction: string;
  phaseId: string | null;
}

interface Project {
  id: string;
  title: string;
  client: string | null;
  color: string;
}

interface Phase {
  id: string;
  name: string;
  project_id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

interface Task {
  id: string;
  title: string;
  due_date: string | null;
  project_id: string | null;
}

interface EmailThreadPanelProps {
  messages: StoredEmail[];
  dateConflicts: DateConflict[];
  mentionedDates: MentionedDate[];
  phaseSignal: PhaseSignal | null;
  calendarConnected: boolean;
  projects: Project[];
  phases: Phase[];
  tasks: Task[];
  hasToneProfile: boolean;
  userEmail: string;
  onDismissConflicts: () => void;
  onDismissPhaseSignal: () => void;
  onPhaseAction: (phaseId: string | null, action: string) => void;
  onCreateCalendarEvent: (params: { summary: string; date: string }) => void;
  onPhaseSignal: (signal: PhaseSignal) => void;
}

type ReplyMode = "reply" | "replyAll" | "forward";

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();
  if (isToday) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isThisYear)
    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function getAvatarColor(name: string): string {
  const palette = [
    "#3b82f6",
    "#8b5cf6",
    "#10b981",
    "#ec4899",
    "#f97316",
    "#06b6d4",
    "#84cc16",
    "#ef4444",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0x7fffffff;
  return palette[h % palette.length];
}

type Segment = { type: "text"; content: string } | { type: "quote"; lines: string[] };

function parseEmailBody(raw: string): Segment[] {
  if (!raw) return [];
  const lines = raw.split("\n");
  const result: Segment[] = [];
  let currentType: "text" | "quote" | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!buffer.length) return;
    if (currentType === "text") {
      const content = buffer.join("\n").trim();
      if (content) result.push({ type: "text", content });
    } else if (currentType === "quote") {
      const clean = buffer.map((l) => l.replace(/^>+\s?/, ""));
      if (clean.some((l) => l.trim())) result.push({ type: "quote", lines: clean });
    }
    buffer = [];
  };

  for (const line of lines) {
    const type: "text" | "quote" = /^>+/.test(line) ? "quote" : "text";
    if (type !== currentType) {
      flush();
      currentType = type;
    }
    buffer.push(line);
  }
  flush();
  return result;
}

function QuoteBlock({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors select-none"
      >
        <span className="flex items-center gap-0.5">
          <span className="block w-4 h-px bg-current" />
          <span className="block w-2.5 h-px bg-current" />
          <span className="block w-1.5 h-px bg-current" />
        </span>
        {open
          ? "Hide quoted text"
          : `${lines.length} line${lines.length !== 1 ? "s" : ""} of quoted text`}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-2 border-l-2 border-border/40 pl-3 space-y-0.5">
              {lines.map((line, i) => (
                <p key={i} className="text-[11px] text-muted-foreground/50 leading-relaxed">
                  {line || "\u00a0"}
                </p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HtmlEmailFrame({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const idRef = useRef(`hef-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    const id = idRef.current;
    const handler = (e: MessageEvent) => {
      if (
        e.data?.type === "prdcr-iframe-height" &&
        e.data?.id === id &&
        typeof e.data.height === "number" &&
        e.data.height > 0
      ) {
        setHeight(e.data.height + 24);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const id = idRef.current;
  const heightScript = `<script>
(function(){
  var ID="${id}";
  function send(){
    var h=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight);
    parent.postMessage({type:"prdcr-iframe-height",id:ID,height:h},"*");
  }
  if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",send);}else{send();}
  window.addEventListener("load",send);
  document.addEventListener("load",function(e){if(e.target&&e.target.nodeName==="IMG")send();},true);
  if(window.ResizeObserver){new ResizeObserver(send).observe(document.body);}
  setTimeout(send,200);setTimeout(send,800);setTimeout(send,2000);
})();
</script>`;

  const srcDoc = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${heightScript}
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;line-height:1.6;color:#111827;background:#fff;word-break:break-word;overflow-x:hidden}
  img{max-width:100%;height:auto}
  a{color:#3b82f6;text-decoration:underline}
  pre,code{white-space:pre-wrap;word-break:break-word;font-size:12px}
  blockquote{border-left:3px solid #e5e7eb;margin:8px 0;padding-left:12px;color:#6b7280}
  table{border-collapse:collapse;max-width:100%}
  td,th{padding:4px 8px;vertical-align:top}
  p{margin:0 0 8px}
  h1,h2,h3,h4{margin:12px 0 6px;font-weight:600}
  ul,ol{padding-left:20px;margin:6px 0}
  .gmail_quote,.moz-cite-prefix{color:#6b7280;font-size:12px}
  [style*="display:none"],[style*="display: none"]{display:none!important}
</style>
</head><body>${html}</body></html>`;

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      className="w-full border-0 block"
      style={{ height }}
      title="Email content"
    />
  );
}

function EmailMessage({
  email,
  isLatest,
  index,
}: {
  email: StoredEmail;
  isLatest: boolean;
  index: number;
}) {
  const [expanded, setExpanded] = useState(isLatest);
  const [showAllRecipients, setShowAllRecipients] = useState(false);
  const displayName = email.from_name || email.from_email;
  const avatarColor = getAvatarColor(displayName);
  const segments = parseEmailBody(email.body_text ?? email.snippet ?? "");

  const ccList = (email as StoredEmail & { cc_emails?: string[] }).cc_emails ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.2, ease: "easeOut" }}
      className="border-b border-border/20 last:border-0"
    >
      <button
        className={cn(
          "w-full flex items-center justify-between px-5 py-4 transition-colors text-left gap-3",
          expanded ? "bg-transparent" : "hover:bg-sidebar-accent/10"
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 flex items-center justify-center text-[13px] font-bold text-white shrink-0"
            style={{ backgroundColor: avatarColor }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{email.from_name || email.from_email}</p>
            {expanded && email.from_email ? (
              <p className="text-[11px] text-muted-foreground/60 mt-0.5 select-all font-mono">
                {email.from_email}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground/50 truncate max-w-[320px] mt-0.5">
                {email.snippet}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground/50">{formatTime(email.received_at)}</span>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/30" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/30" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Recipient metadata */}
            <div className="pl-17 pr-5 pb-3 pl-[68px] space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wide font-medium w-5 shrink-0">To</span>
                <span className="text-[11px] text-muted-foreground/60">
                  {(email.to_emails ?? []).slice(0, showAllRecipients ? undefined : 2).join(", ")}
                  {!showAllRecipients && (email.to_emails ?? []).length > 2 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowAllRecipients(true); }}
                      className="ml-1 text-muted-foreground/40 hover:text-foreground transition-colors"
                    >
                      +{(email.to_emails ?? []).length - 2} more
                    </button>
                  )}
                </span>
              </div>
              {ccList.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wide font-medium w-5 shrink-0">CC</span>
                  <span className="text-[11px] text-muted-foreground/50">{ccList.join(", ")}</span>
                </div>
              )}
            </div>

            {/* Email body */}
            <div className="bg-white overflow-hidden">
              {email.body_html ? (
                <HtmlEmailFrame html={email.body_html} />
              ) : (
                <div className="pl-[68px] pr-5 py-3 space-y-3">
                  {segments.length === 0 ? (
                    <p className="text-sm text-muted-foreground/40 italic">No content</p>
                  ) : (
                    segments.map((seg, i) =>
                      seg.type === "text" ? (
                        <p
                          key={i}
                          className="text-[13px] text-gray-800 leading-relaxed whitespace-pre-wrap"
                        >
                          {seg.content}
                        </p>
                      ) : (
                        <QuoteBlock key={i} lines={seg.lines} />
                      )
                    )
                  )}
                </div>
              )}
            </div>

            {/* Attachments */}
            {email.attachments?.length > 0 && (
              <div className="mt-3 pl-[68px] pr-5 pb-4 flex flex-wrap gap-2">
                {email.attachments.map((att, i) => (
                  <a
                    key={i}
                    href={`/api/email/attachment?messageId=${email.gmail_message_id}&attachmentId=${att.attachmentId}&filename=${encodeURIComponent(att.filename)}&mimeType=${encodeURIComponent(att.mimeType)}`}
                    download={att.filename}
                    className="flex items-center gap-1.5 text-[11px] text-foreground/70 border border-border/50 bg-sidebar-accent/30 px-2.5 py-1.5 hover:border-primary/40 hover:text-foreground hover:bg-sidebar-accent/60 transition-colors"
                  >
                    <Paperclip className="w-3 h-3 shrink-0" />
                    <span className="truncate max-w-[160px]">{att.filename}</span>
                    <span className="text-muted-foreground/40 shrink-0">
                      {formatFileSize(att.size)}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CalendarEventForm({
  date,
  defaultTitle,
  onSubmit,
  onClose,
}: {
  date: MentionedDate;
  defaultTitle: string;
  onSubmit: (summary: string, isoDate: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(defaultTitle);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim() || !date.iso) return;
      onSubmit(title.trim(), date.iso);
      onClose();
    },
    [title, date.iso, onSubmit, onClose]
  );

  return (
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15 }}
      onSubmit={handleSubmit}
      className="overflow-hidden mt-1.5 border border-primary/20 bg-primary/5 p-2.5 space-y-2"
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Event title"
        className="w-full text-xs bg-background border border-border px-2 py-1.5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors"
        autoFocus
      />
      <p className="text-[10px] text-muted-foreground/50">
        {date.raw} · all day · {date.iso}
      </p>
      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={!title.trim()}
          className="text-[10px] font-semibold px-2.5 py-1 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
        >
          Add to Calendar
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] px-2.5 py-1 text-muted-foreground hover:text-foreground border border-border transition-colors"
        >
          Cancel
        </button>
      </div>
    </motion.form>
  );
}

export function EmailThreadPanel({
  messages,
  dateConflicts,
  mentionedDates,
  phaseSignal,
  calendarConnected,
  projects,
  phases,
  tasks,
  hasToneProfile,
  userEmail,
  onDismissConflicts,
  onDismissPhaseSignal,
  onPhaseAction,
  onCreateCalendarEvent,
  onPhaseSignal,
}: EmailThreadPanelProps) {
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyMode, setReplyMode] = useState<ReplyMode>("reply");
  const [activeCalendarDate, setActiveCalendarDate] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when thread loads
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Close compose when thread changes
  useEffect(() => {
    setComposeOpen(false);
  }, [messages[0]?.gmail_thread_id]);

  if (!messages.length) {
    return (
      <div className="flex h-full items-center justify-center bg-white">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-muted-foreground/30"
        >
          Select an email to read
        </motion.p>
      </div>
    );
  }

  const subject = messages[0]?.subject ?? "(No subject)";
  const latestIdx = messages.length - 1;
  const calendarDates = mentionedDates.filter((d) => d.iso);

  // Only flag phase-level scheduling conflicts (not individual task dates)
  const realConflicts = dateConflicts.filter((c) => c.conflictType === "phase");

  function openReply(mode: ReplyMode) {
    setReplyMode(mode);
    setComposeOpen(true);
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Subject header ── */}
      <div className="px-5 py-4 border-b border-border/30 shrink-0 bg-white">
        <h2 className="text-base font-semibold text-foreground leading-snug">{subject}</h2>
        <p className="text-[11px] text-muted-foreground/50 mt-0.5">
          {messages.length} message{messages.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* ── Banners ── */}
      <AnimatePresence>
        {/* Phase scheduling conflict — only shown for actual phase overlaps */}
        {realConflicts.length > 0 && (
          <motion.div
            key="conflict"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="shrink-0 overflow-hidden"
          >
            <div className="mx-4 mt-3 border border-border bg-sidebar-accent/50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 flex items-center justify-center bg-orange-500/15 mt-0.5 shrink-0">
                    <AlertTriangle className="w-3 h-3 text-orange-400" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      Scheduling conflict
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {realConflicts.map((c, i) => (
                        <li key={i} className="text-[11px] text-muted-foreground leading-relaxed">
                          <span className="text-orange-400 font-medium">{c.mentionedDate}</span>
                          {" overlaps with "}
                          <span className="text-foreground/80 font-medium">{c.conflictName}</span>
                          <span className="text-muted-foreground/50"> — {c.conflictDetails}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <button
                  onClick={onDismissConflicts}
                  className="text-muted-foreground/30 hover:text-foreground transition-colors mt-0.5 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {phaseSignal?.detected && (
          <motion.div
            key="phase"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="shrink-0 overflow-hidden"
          >
            <div className="mx-4 mt-3 border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 flex items-center justify-center bg-primary/15 mt-0.5 shrink-0">
                    <GitBranch className="w-3 h-3 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">Phase update suggested</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      {phaseSignal.description}
                    </p>
                    <button
                      onClick={() => onPhaseAction(phaseSignal.phaseId, phaseSignal.suggestedAction)}
                      className="mt-2 text-[11px] text-primary border border-primary/30 px-2.5 py-1 hover:bg-primary/10 transition-colors flex items-center gap-1.5"
                    >
                      {phaseSignal.suggestedAction}
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <button
                  onClick={onDismissPhaseSignal}
                  className="text-muted-foreground/30 hover:text-foreground transition-colors mt-0.5 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Calendar dates — only when Google Calendar is connected */}
        {calendarConnected && calendarDates.length > 0 && (
          <motion.div
            key="calendar-dates"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="shrink-0 overflow-hidden"
          >
            <div className="mx-4 mt-3 border border-border/60 bg-sidebar-accent/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <CalendarPlus className="w-3.5 h-3.5 text-muted-foreground/50" />
                <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  Dates mentioned
                </p>
              </div>
              <div className="space-y-2">
                {calendarDates.map((d, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[11px] font-medium text-foreground/80">{d.raw}</span>
                        {d.context && (
                          <p className="text-[10px] text-muted-foreground/50 truncate max-w-[240px] mt-0.5">
                            &ldquo;{d.context.trim()}&rdquo;
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() =>
                          setActiveCalendarDate(
                            activeCalendarDate === d.iso ? null : (d.iso ?? null)
                          )
                        }
                        className={cn(
                          "flex items-center gap-1 text-[10px] font-medium px-2 py-1 border shrink-0 transition-colors",
                          activeCalendarDate === d.iso
                            ? "bg-primary/10 border-primary/40 text-primary"
                            : "border-border/50 text-muted-foreground/60 hover:border-primary/30 hover:text-primary"
                        )}
                      >
                        <CalendarPlus className="w-3 h-3" />
                        Add
                      </button>
                    </div>
                    <AnimatePresence>
                      {activeCalendarDate === d.iso && (
                        <CalendarEventForm
                          date={d}
                          defaultTitle={subject}
                          onSubmit={(summary, isoDate) =>
                            onCreateCalendarEvent({ summary, date: isoDate })
                          }
                          onClose={() => setActiveCalendarDate(null)}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Messages scroll area ── */}
      <div className="flex-1 overflow-y-auto bg-white">
        <div className="py-2">
          {messages.map((msg, i) => (
            <EmailMessage key={msg.id} email={msg} isLatest={i === latestIdx} index={i} />
          ))}
        </div>

        {/* Reply action bar */}
        {!composeOpen && (
          <div className="px-5 py-4 flex items-center gap-2">
            <button
              onClick={() => openReply("reply")}
              className="flex items-center gap-1.5 text-xs font-medium text-foreground border border-border/60 px-3 py-2 hover:bg-sidebar-accent/30 hover:border-border transition-colors"
            >
              <Reply className="w-3.5 h-3.5" />
              Reply
            </button>
            <button
              onClick={() => openReply("replyAll")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border/40 px-3 py-2 hover:bg-sidebar-accent/20 hover:text-foreground hover:border-border/60 transition-colors"
            >
              <ReplyAll className="w-3.5 h-3.5" />
              Reply All
            </button>
            <button
              onClick={() => openReply("forward")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border/40 px-3 py-2 hover:bg-sidebar-accent/20 hover:text-foreground hover:border-border/60 transition-colors"
            >
              <Forward className="w-3.5 h-3.5" />
              Forward
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Inline compose drawer ── */}
      <AnimatePresence>
        {composeOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="shrink-0 overflow-hidden border-t border-border/40"
          >
            <EmailComposePanel
              threadMessages={messages}
              replyMode={replyMode}
              projects={projects}
              phases={phases}
              tasks={tasks}
              hasToneProfile={hasToneProfile}
              userEmail={userEmail}
              onClose={() => setComposeOpen(false)}
              onSent={() => setComposeOpen(false)}
              onPhaseSignal={onPhaseSignal}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
