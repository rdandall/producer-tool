"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  Send,
  Zap,
  X,
  Loader2,
  Paperclip,
  ChevronDown,
  Mic,
  MicOff,
  RefreshCw,
  Clock,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ContactAutocomplete, type Contact } from "@/components/notes/contact-autocomplete";
import { useLiveDictation } from "@/hooks/use-live-dictation";

type ComposeMode = "write" | "ai";
type ToneType = "punchy" | "balanced" | "detailed";

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

interface NewEmailModalProps {
  projects: Project[];
  phases: Phase[];
  tasks: Task[];
  hasToneProfile: boolean;
  userEmail: string;
  onClose: () => void;
  onSent: () => void;
}

const TONE_LABELS: Record<ToneType, string> = {
  punchy: "Punchy",
  balanced: "Balanced",
  detailed: "Detailed",
};

export function NewEmailModal({
  hasToneProfile,
  onClose,
  onSent,
}: NewEmailModalProps) {
  const [mode, setMode] = useState<ComposeMode>("write");
  const [toRecipients, setToRecipients] = useState<Contact[]>([]);
  const [ccRecipients, setCcRecipients] = useState<Contact[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [aiNotes, setAiNotes] = useState("");
  const [aiGenerated, setAiGenerated] = useState(false);
  const [tone, setTone] = useState<ToneType>("balanced");
  const [showTonePicker, setShowTonePicker] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 160)}px`;
  }, [text]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const updateBodyText = useCallback((nextValue: string) => {
    setText(nextValue);
    setAiGenerated(false);
  }, []);

  const {
    isFinalizing,
    isLiveFormatting,
    isRecording: isListening,
    toggleDictation,
  } = useLiveDictation({
    value: mode === "ai" ? aiNotes : text,
    onChange: mode === "ai" ? setAiNotes : updateBodyText,
    contextType: mode === "ai" ? "email-notes" : "email-body",
    minLiveIntervalMs: 900,
  });

  async function handleGenerate() {
    if (!aiNotes.trim()) return;
    setIsGenerating(true);

    try {
      const res = await fetch("/api/email/generate-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread: [],
          userNotes: aiNotes.trim(),
          variantType: tone,
          subject: subject.trim() || undefined,
        }),
      });

      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();
      const generated =
        data.variants?.[tone] ?? data.variants?.balanced ?? data.variants?.punchy ?? "";

      if (generated) {
        setText(generated);
        setAiGenerated(true);
      }
    } catch {
      toast.error("Failed to generate. Try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRegen() {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/email/generate-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread: [],
          userNotes: aiNotes.trim(),
          variantType: tone,
          subject: subject.trim() || undefined,
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

  const dictationBusy = isListening || isFinalizing;

  async function handleSend() {
    const body = text.trim();
    if (!body) {
      toast.error("Write something before sending.");
      return;
    }
    if (toRecipients.length === 0) {
      toast.error("Add at least one recipient.");
      return;
    }
    if (!subject.trim()) {
      toast.error("Add a subject line.");
      return;
    }

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
          to: toRecipients.map((c) => c.email),
          cc: ccRecipients.length > 0 ? ccRecipients.map((c) => c.email) : undefined,
          subject: subject.trim(),
          emailBody: body,
          // No threadId = new email
          isHtml: false,
          attachments: attachmentData.length > 0 ? attachmentData : undefined,
          scheduledAt: scheduledAt || undefined,
        }),
      });

      const payload = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Send failed");
      toast.success(scheduledAt ? "Email scheduled" : "Email sent");
      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send.");
    } finally {
      setIsSending(false);
    }
  }

  const canGenerate = mode === "ai" && aiNotes.trim().length > 0;
  const canSend = text.trim().length > 0 && toRecipients.length > 0 && subject.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="w-full max-w-2xl bg-background border border-border shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-foreground">New Email</span>
          <button
            onClick={onClose}
            className="text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── To field ── */}
        <div className="px-5 py-2.5 border-b border-border/40 flex items-start gap-3">
          <span className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-wide pt-2 w-8 shrink-0">To</span>
          <ContactAutocomplete value={toRecipients} onChange={setToRecipients} />
        </div>

        {/* ── CC field (toggleable) ── */}
        {showCc && (
          <div className="px-5 py-2.5 border-b border-border/30 flex items-start gap-3">
            <span className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-wide pt-2 w-8 shrink-0">CC</span>
            <ContactAutocomplete value={ccRecipients} onChange={setCcRecipients} />
          </div>
        )}

        {/* ── Subject ── */}
        <div className="px-5 py-2.5 border-b border-border/40 flex items-center gap-3">
          <span className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-wide w-8 shrink-0">Re</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="flex-1 text-[13px] text-foreground bg-transparent border-0 focus:outline-none placeholder:text-muted-foreground/30"
          />
          <button
            onClick={() => setShowCc((v) => !v)}
            className={cn(
              "text-[10px] border px-2 py-0.5 transition-colors shrink-0",
              showCc
                ? "border-primary/40 text-primary"
                : "border-border/40 text-muted-foreground/40 hover:text-foreground"
            )}
          >
            CC
          </button>
        </div>

        {/* ── Mode toggle + tone ── */}
        <div className="flex items-center gap-3 px-5 py-2 border-b border-border/30 shrink-0">
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
                        tone === t
                          ? "bg-sidebar-accent text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
                      )}
                    >
                      {TONE_LABELS[t]}
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
                  toast.info("Analyzing sent emails...");
                  const res = await fetch("/api/email/analyze-tone", { method: "POST" });
                  if (res.ok) {
                    const d = await res.json();
                    toast.success(`Tone profile built from ${d.sampleCount} emails.`);
                  }
                }}
              >
                build one
              </button>
            </span>
          )}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
          {/* AI notes */}
          {mode === "ai" && !aiGenerated && (
            <div className="px-5 pt-4 pb-2 border-b border-border/20 bg-sidebar-accent/5">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
                  Your notes
                </label>
                <button
                  onClick={toggleDictation}
                  disabled={isFinalizing}
                  className={cn(
                    "flex items-center gap-1 text-[10px] px-2 py-0.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                    isListening
                      ? "border-red-400/60 text-red-400"
                      : "border-border/40 text-muted-foreground/40 hover:text-foreground"
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
                readOnly={mode === "ai" && dictationBusy}
                placeholder="Tell me what you want to say..."
                rows={3}
                className={cn(
                  "w-full resize-none text-[13px] text-foreground bg-transparent border-0 focus:outline-none placeholder:text-muted-foreground/30 leading-relaxed",
                  mode === "ai" && dictationBusy && "cursor-not-allowed text-foreground/80"
                )}
              />
            </div>
          )}

          {mode === "ai" && aiGenerated && aiNotes && (
            <div className="px-5 py-1.5 border-b border-border/20 bg-sidebar-accent/5 flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground/40 truncate flex-1">
                From: {aiNotes.slice(0, 70)}{aiNotes.length > 70 ? "…" : ""}
              </span>
              <button
                onClick={() => { setAiGenerated(false); setText(""); }}
                className="text-[10px] text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
              >
                Edit notes
              </button>
            </div>
          )}

          {/* Main compose area */}
          <div className="relative px-5 pt-4 pb-2 flex-1">
            {mode === "write" && (
              <button
                onClick={toggleDictation}
                disabled={isFinalizing}
                className={cn(
                  "absolute top-4 right-5 flex items-center gap-1 text-[10px] px-2 py-0.5 border transition-colors z-10 disabled:opacity-40 disabled:cursor-not-allowed",
                  isListening
                    ? "border-red-400/60 text-red-400 bg-background"
                    : "border-border/30 text-muted-foreground/40 hover:text-foreground bg-background"
                )}
              >
                {isListening ? <MicOff className="w-2.5 h-2.5" /> : <Mic className="w-2.5 h-2.5" />}
                {isListening && <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />}
              </button>
            )}

            {isGenerating ? (
              <div className="min-h-[160px] flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Writing in your voice...</span>
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => updateBodyText(e.target.value)}
                readOnly={mode === "write" && dictationBusy}
                placeholder={
                  mode === "ai"
                    ? aiGenerated
                      ? "Edit this or send as-is..."
                      : "Your generated email will appear here..."
                    : "Write your email..."
                }
                className={cn(
                  "w-full resize-none text-[13px] text-foreground bg-transparent border-0 focus:outline-none placeholder:text-muted-foreground/30 leading-relaxed",
                  mode === "write" && "pr-16",
                  mode === "write" && dictationBusy && "cursor-not-allowed text-foreground/80"
                )}
                style={{ minHeight: "160px" }}
              />
            )}
          </div>

          {/* Generate button */}
          {mode === "ai" && !aiGenerated && canGenerate && !isGenerating && (
            <div className="px-5 pb-3">
              {(isLiveFormatting || isFinalizing) && (
                <p className="mb-2 text-[10px] text-muted-foreground/60">
                  {isFinalizing ? "Final polish…" : "Tidying as you talk…"}
                </p>
              )}
              <button
                onClick={handleGenerate}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold bg-foreground text-background hover:opacity-90 transition-opacity"
              >
                <Zap className="w-3.5 h-3.5" />
                Generate email in my voice
              </button>
            </div>
          )}

          {/* Regen */}
          {mode === "ai" && aiGenerated && !isGenerating && (
            <div className="px-5 pb-3">
              <button
                onClick={handleRegen}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground border border-border/40 px-3 py-1.5 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate ({TONE_LABELS[tone]})
              </button>
            </div>
          )}
        </div>

        {/* ── Attachments ── */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-5 py-2 border-t border-border/30">
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

        {/* ── Schedule ── */}
        {showSchedule && (
          <div className="px-5 py-2 border-t border-border/30 flex items-center gap-2">
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

        {/* ── Footer ── */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-7 h-7 flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-sidebar-accent/50 transition-colors"
              title="Attach file"
            >
              <Paperclip className="w-3.5 h-3.5" />
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
                "w-7 h-7 flex items-center justify-center transition-colors",
                showSchedule || scheduledAt
                  ? "text-primary"
                  : "text-muted-foreground/50 hover:text-foreground hover:bg-sidebar-accent/50"
              )}
              title="Schedule send"
            >
              <Clock className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-xs text-muted-foreground hover:text-foreground border border-border/40 px-3 py-2 transition-colors"
            >
              Discard
            </button>
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
        </div>
      </motion.div>
    </div>
  );
}
