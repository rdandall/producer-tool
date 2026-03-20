"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  Send,
  Zap,
  X,
  Loader2,
  Bold,
  Italic,
  Link,
  List,
  Paperclip,
  ChevronDown,
  Mic,
  MicOff,
  RefreshCw,
  Users,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { StoredEmail } from "@/lib/db/emails";
import { ContactAutocomplete, type Contact } from "@/components/notes/contact-autocomplete";

type ComposeMode = "write" | "ai";
type ToneType = "punchy" | "balanced" | "detailed";
type ReplyMode = "reply" | "replyAll" | "forward";

interface PhaseSignalResult {
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

interface EmailComposePanelProps {
  threadMessages: StoredEmail[];
  replyMode: ReplyMode;
  projects: Project[];
  phases: Phase[];
  tasks: Task[];
  hasToneProfile: boolean;
  userEmail: string;
  onClose: () => void;
  onSent: () => void;
  onPhaseSignal: (signal: PhaseSignalResult) => void;
}

const TONE_LABELS: Record<ToneType, string> = {
  punchy: "Punchy",
  balanced: "Balanced",
  detailed: "Detailed",
};

function getReplyRecipients(
  threadMessages: StoredEmail[],
  replyMode: ReplyMode,
  userEmail: string
): string[] {
  const latest = threadMessages[threadMessages.length - 1];
  if (!latest) return [];

  if (replyMode === "forward") return [];

  if (replyMode === "reply") {
    return latest.from_email ? [latest.from_email] : [];
  }

  // reply all: sender + all To: recipients except self
  const all = new Set<string>();
  if (latest.from_email) all.add(latest.from_email);
  for (const to of latest.to_emails ?? []) {
    if (to.toLowerCase() !== userEmail.toLowerCase()) all.add(to);
  }
  return Array.from(all);
}

export function EmailComposePanel({
  threadMessages,
  replyMode,
  projects,
  phases,
  tasks,
  hasToneProfile,
  userEmail,
  onClose,
  onSent,
  onPhaseSignal,
}: EmailComposePanelProps) {
  const [mode, setMode] = useState<ComposeMode>("write");
  const [text, setText] = useState("");
  const [aiNotes, setAiNotes] = useState("");
  const [aiGenerated, setAiGenerated] = useState(false);
  const [tone, setTone] = useState<ToneType>("balanced");
  const [showTonePicker, setShowTonePicker] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [ccRecipients, setCcRecipients] = useState<Contact[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [showSchedule, setShowSchedule] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const latestMsg = threadMessages[threadMessages.length - 1];
  const replyRecipients = getReplyRecipients(threadMessages, replyMode, userEmail);

  const subjectPrefix = replyMode === "forward" ? "Fwd: " : "Re: ";
  const subject = latestMsg?.subject
    ? latestMsg.subject.startsWith("Re:") || latestMsg.subject.startsWith("Fwd:")
      ? latestMsg.subject
      : `${subjectPrefix}${latestMsg.subject}`
    : "(No subject)";

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 140)}px`;
  }, [text]);

  const toggleDictation = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Speech recognition not supported in this browser.");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SR() as any;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    let finalBase = mode === "ai" ? aiNotes : text;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalBase += (finalBase ? " " : "") + t.trim();
        } else {
          interim = t;
        }
      }
      const combined = finalBase + (interim ? " " + interim : "");
      if (mode === "ai") setAiNotes(combined);
      else setText(combined);
    };

    recognition.onend = () => {
      if (mode === "ai") setAiNotes(finalBase);
      else setText(finalBase);
      setIsListening(false);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.start();
    setIsListening(true);
  }, [isListening, mode, aiNotes, text]);

  const inferredProject = useCallback(() => {
    const threadText = threadMessages.map((m) => m.body_text ?? m.snippet ?? "").join(" ");
    const subjectText = threadMessages[0]?.subject ?? "";
    return projects.find(
      (p) =>
        threadText.toLowerCase().includes(p.title.toLowerCase()) ||
        (p.client && threadText.toLowerCase().includes(p.client.toLowerCase())) ||
        subjectText.toLowerCase().includes(p.title.toLowerCase())
    );
  }, [threadMessages, projects]);

  async function handleGenerate() {
    if (!threadMessages.length) return;
    setIsGenerating(true);

    try {
      const project = inferredProject();
      const relevantPhases = project ? phases.filter((ph) => ph.project_id === project.id) : [];
      const relevantTasks = project ? tasks.filter((t) => t.project_id === project.id) : [];

      const res = await fetch("/api/email/generate-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread: threadMessages,
          projectContext: project ?? null,
          phases: relevantPhases,
          tasks: relevantTasks,
          userNotes: aiNotes.trim() || undefined,
          variantType: tone,
        }),
      });

      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();

      const generated =
        data.variants?.[tone] ??
        data.variants?.balanced ??
        data.variants?.punchy ??
        "";

      if (generated) {
        setText(generated);
        setAiGenerated(true);
      }

      if (data.phaseSignal?.detected) {
        onPhaseSignal(data.phaseSignal);
      }
    } catch {
      toast.error("Failed to generate. Try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRegen() {
    if (!text || !aiGenerated) return;
    setIsGenerating(true);

    try {
      const project = inferredProject();
      const relevantPhases = project ? phases.filter((ph) => ph.project_id === project.id) : [];

      const res = await fetch("/api/email/generate-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread: threadMessages,
          projectContext: project ?? null,
          phases: relevantPhases,
          tasks: [],
          userNotes: aiNotes.trim() || undefined,
          variantType: tone,
        }),
      });

      if (!res.ok) throw new Error("Regeneration failed");
      const data = await res.json();
      const generated = data.variants?.[tone] ?? data.variants?.balanced ?? "";
      if (generated) {
        setText(generated);
        toast.success("Regenerated");
      }
    } catch {
      toast.error("Regeneration failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleSend() {
    const body = text.trim();
    if (!body) {
      toast.error("Write something before sending.");
      return;
    }
    if (!latestMsg) return;

    setIsSending(true);
    try {
      const attachmentData = await Promise.all(
        attachments.map(async (file) => ({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          data: await fileToBase64(file),
        }))
      );

      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: replyRecipients.join(", "),
          cc: ccRecipients.length > 0 ? ccRecipients.map((c) => c.email) : undefined,
          subject,
          emailBody: body,
          threadId: latestMsg.gmail_thread_id,
          isHtml: false,
          attachments: attachmentData.length > 0 ? attachmentData : undefined,
          scheduledAt: scheduledAt || undefined,
        }),
      });

      if (!res.ok) throw new Error("Send failed");
      toast.success(scheduledAt ? "Email scheduled" : "Sent");
      onSent();
    } catch {
      toast.error("Failed to send. Check your Gmail connection.");
    } finally {
      setIsSending(false);
    }
  }

  function execFormat(command: string, value?: string) {
    document.execCommand(command, false, value ?? undefined);
    textareaRef.current?.focus();
  }

  const activeNotes = mode === "ai" ? aiNotes : text;
  const canGenerate = mode === "ai" && aiNotes.trim().length > 0;
  const canSend = text.trim().length > 0;

  return (
    <div className="border-t border-border bg-background flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 bg-sidebar-accent/10">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              {replyMode === "reply" ? "Reply" : replyMode === "replyAll" ? "Reply All" : "Forward"}
            </span>
            <span className="text-[10px] text-muted-foreground/50 truncate max-w-[240px]">{subject}</span>
          </div>
          {replyRecipients.length > 0 && (
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">
              → {replyRecipients.join(", ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* CC toggle */}
          <button
            onClick={() => setShowCc((v) => !v)}
            className={cn(
              "text-[10px] px-2 py-0.5 border transition-colors flex items-center gap-1",
              showCc
                ? "border-primary/40 text-primary bg-primary/5"
                : "border-border/40 text-muted-foreground/50 hover:text-foreground"
            )}
          >
            <Users className="w-2.5 h-2.5" />
            CC
          </button>
          <button
            onClick={onClose}
            className="text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── CC field ── */}
      {showCc && (
        <div className="px-4 py-2 border-b border-border/40 bg-sidebar-accent/5">
          <div className="flex items-start gap-2">
            <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wide font-semibold pt-2 shrink-0 w-5">CC</span>
            <ContactAutocomplete value={ccRecipients} onChange={setCcRecipients} />
          </div>
        </div>
      )}

      {/* ── Mode toggle ── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/40">
        <div className="flex border border-border/60">
          <button
            onClick={() => { setMode("write"); setAiGenerated(false); }}
            className={cn(
              "px-3 py-1 text-[11px] transition-colors",
              mode === "write"
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Write
          </button>
          <button
            onClick={() => setMode("ai")}
            className={cn(
              "px-3 py-1 text-[11px] transition-colors flex items-center gap-1",
              mode === "ai"
                ? "bg-foreground text-background font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Zap className="w-2.5 h-2.5" />
            AI Assist
          </button>
        </div>

        {/* Tone picker — only visible in AI mode */}
        {mode === "ai" && (
          <div className="relative">
            <button
              onClick={() => setShowTonePicker((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground border border-border/40 px-2.5 py-1 transition-colors"
            >
              {TONE_LABELS[tone]}
              <ChevronDown className={cn("w-2.5 h-2.5 transition-transform", showTonePicker && "rotate-180")} />
            </button>
            {showTonePicker && (
              <div className="absolute top-full left-0 mt-1 w-32 border border-border bg-background shadow-lg z-10">
                {(["punchy", "balanced", "detailed"] as ToneType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTone(t); setShowTonePicker(false); }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-[11px] transition-colors",
                      tone === t ? "bg-sidebar-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
                    )}
                  >
                    {TONE_LABELS[t]}
                    <span className="ml-1 text-[10px] text-muted-foreground/50">
                      {t === "punchy" ? "short" : t === "balanced" ? "standard" : "thorough"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!hasToneProfile && mode === "ai" && (
          <span className="text-[10px] text-amber-400/70 ml-auto">
            No tone profile —{" "}
            <button
              className="underline hover:no-underline"
              onClick={async () => {
                toast.info("Analyzing your sent emails...");
                const res = await fetch("/api/email/analyze-tone", { method: "POST" });
                if (res.ok) {
                  const d = await res.json();
                  toast.success(`Tone profile built from ${d.sampleCount} sent emails.`);
                } else {
                  toast.error("Tone analysis failed.");
                }
              }}
            >
              build one
            </button>
          </span>
        )}
      </div>

      {/* ── AI notes (only visible when AI mode and no generated content yet) ── */}
      {mode === "ai" && !aiGenerated && (
        <div className="px-4 pt-3 pb-2 border-b border-border/30 bg-sidebar-accent/5">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
              Your notes
            </label>
            <button
              onClick={toggleDictation}
              className={cn(
                "flex items-center gap-1 text-[10px] px-2 py-0.5 border transition-colors",
                isListening
                  ? "border-red-400/60 text-red-400 bg-red-400/5"
                  : "border-border/40 text-muted-foreground/50 hover:text-foreground"
              )}
            >
              {isListening ? <MicOff className="w-2.5 h-2.5" /> : <Mic className="w-2.5 h-2.5" />}
              {isListening ? "Stop" : "Dictate"}
              {isListening && <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />}
            </button>
          </div>
          <textarea
            value={aiNotes}
            onChange={(e) => setAiNotes(e.target.value)}
            placeholder="Tell me what you want to say — I'll write it in your voice..."
            rows={3}
            className="w-full resize-none text-[13px] text-foreground bg-transparent border-0 focus:outline-none placeholder:text-muted-foreground/30 leading-relaxed"
          />
        </div>
      )}

      {/* ── If AI generated, show a small notes reminder ── */}
      {mode === "ai" && aiGenerated && aiNotes && (
        <div className="px-4 py-1.5 border-b border-border/20 bg-sidebar-accent/5 flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground/40 truncate flex-1">
            From your notes: {aiNotes.slice(0, 60)}{aiNotes.length > 60 ? "…" : ""}
          </span>
          <button
            onClick={() => { setAiGenerated(false); setText(""); }}
            className="text-[10px] text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
          >
            Edit notes
          </button>
        </div>
      )}

      {/* ── Main compose textarea ── */}
      <div className="relative px-4 pt-3 pb-2 flex-1">
        {/* Dictation button for Write mode */}
        {mode === "write" && (
          <button
            onClick={toggleDictation}
            className={cn(
              "absolute top-4 right-5 flex items-center gap-1 text-[10px] px-2 py-0.5 border transition-colors z-10",
              isListening
                ? "border-red-400/60 text-red-400 bg-red-400/5 bg-background"
                : "border-border/30 text-muted-foreground/40 hover:text-foreground bg-background"
            )}
          >
            {isListening ? <MicOff className="w-2.5 h-2.5" /> : <Mic className="w-2.5 h-2.5" />}
            {isListening && <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />}
          </button>
        )}

        {isGenerating ? (
          <div className="min-h-[120px] flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Writing in your voice...</span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => { setText(e.target.value); setAiGenerated(false); }}
            placeholder={
              mode === "ai"
                ? aiGenerated
                  ? "Edit this or send as-is..."
                  : "Your generated email will appear here after you click Generate..."
                : "Write your reply..."
            }
            className={cn(
              "w-full resize-none text-[13px] text-foreground bg-transparent border-0 focus:outline-none placeholder:text-muted-foreground/30 leading-relaxed",
              mode === "write" && "pr-16",
              !text && mode === "ai" && !aiGenerated && "min-h-[80px]",
              text && "min-h-[120px]"
            )}
            style={{ minHeight: "120px" }}
          />
        )}
      </div>

      {/* ── Generate button (AI mode, when notes present and not yet generated) ── */}
      {mode === "ai" && !aiGenerated && canGenerate && !isGenerating && (
        <div className="px-4 pb-3">
          <button
            onClick={handleGenerate}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            <Zap className="w-3.5 h-3.5" />
            Generate email in my voice
          </button>
        </div>
      )}

      {/* ── Regen button (AI mode, after generation) ── */}
      {mode === "ai" && aiGenerated && !isGenerating && (
        <div className="px-4 pb-2">
          <button
            onClick={handleRegen}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground border border-border/40 px-3 py-1.5 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Regenerate ({TONE_LABELS[tone]})
          </button>
        </div>
      )}

      {/* ── Attachments ── */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 py-2 border-t border-border/30">
          {attachments.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 text-[11px] border border-border/50 px-2 py-1 text-foreground/70 bg-sidebar-accent/20"
            >
              <Paperclip className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate max-w-[120px]">{file.name}</span>
              <button
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                className="text-muted-foreground/40 hover:text-foreground transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Schedule picker ── */}
      {showSchedule && (
        <div className="px-4 py-2 border-t border-border/30 flex items-center gap-2">
          <Clock className="w-3 h-3 text-muted-foreground/50 shrink-0" />
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="text-xs bg-transparent border-0 text-foreground focus:outline-none"
          />
          {scheduledAt && (
            <button
              onClick={() => { setScheduledAt(""); setShowSchedule(false); }}
              className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* ── Footer toolbar + send ── */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-border/60">
        {/* Formatting + tools */}
        <div className="flex items-center gap-0.5">
          <button
            onMouseDown={(e) => { e.preventDefault(); execFormat("bold"); }}
            className="w-6 h-6 flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-sidebar-accent/50 transition-colors"
            title="Bold"
          >
            <Bold className="w-3 h-3" />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execFormat("italic"); }}
            className="w-6 h-6 flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-sidebar-accent/50 transition-colors"
            title="Italic"
          >
            <Italic className="w-3 h-3" />
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              const url = prompt("Enter URL:");
              if (url) execFormat("createLink", url);
            }}
            className="w-6 h-6 flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-sidebar-accent/50 transition-colors"
            title="Insert link"
          >
            <Link className="w-3 h-3" />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execFormat("insertUnorderedList"); }}
            className="w-6 h-6 flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-sidebar-accent/50 transition-colors"
            title="Bullet list"
          >
            <List className="w-3 h-3" />
          </button>
          <div className="w-px h-4 bg-border/40 mx-1" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-6 h-6 flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-sidebar-accent/50 transition-colors"
            title="Attach file"
          >
            <Paperclip className="w-3 h-3" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              setAttachments((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => setShowSchedule((v) => !v)}
            className={cn(
              "w-6 h-6 flex items-center justify-center transition-colors",
              showSchedule || scheduledAt
                ? "text-primary"
                : "text-muted-foreground/50 hover:text-foreground hover:bg-sidebar-accent/50"
            )}
            title="Schedule send"
          >
            <Clock className="w-3 h-3" />
          </button>
        </div>

        <button
          onClick={handleSend}
          disabled={isSending || !canSend || isGenerating}
          className="flex items-center gap-2 text-xs font-semibold bg-foreground text-background px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-30"
        >
          {isSending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          {scheduledAt ? "Schedule" : "Send"}
        </button>
      </div>

      {/* ── Keyboard hint: Cmd/Ctrl+Enter to send ── */}
      <div
        className="px-4 pb-1.5"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSend();
        }}
      />
    </div>
  );
}
