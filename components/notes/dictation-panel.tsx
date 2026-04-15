"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Sparkles, Trash2, ChevronDown, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { NoteType } from "@/lib/db/notes";

const TYPE_OPTIONS: { value: NoteType; label: string; description: string }[] = [
  { value: "brief",          label: "Edit Brief",     description: "Instructions for your editor" },
  { value: "meeting-notes",  label: "Meeting Notes",  description: "Call or meeting summary" },
  { value: "project-notes",  label: "Project Notes",  description: "General project notes" },
  { value: "client-brief",   label: "Client Brief",   description: "Client-facing document" },
  { value: "note",           label: "Note",           description: "General-purpose note" },
  { value: "quote",          label: "Quote",          description: "Quote or estimate" },
  { value: "idea",           label: "Idea",           description: "Capture an idea" },
  { value: "spec",           label: "Spec",           description: "Technical specification" },
  { value: "project-update", label: "Project Update", description: "Status update for a project" },
];

interface Props {
  onGenerate: (rawInput: string, type: NoteType) => void;
  isGenerating: boolean;
  projectOptions: { id: string; title: string; client: string | null }[];
  selectedProjectId: string | null;
  onProjectChange: (id: string | null) => void;
  defaultDocType?: NoteType;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

export function DictationPanel({
  onGenerate,
  isGenerating,
  projectOptions,
  selectedProjectId,
  onProjectChange,
  defaultDocType = "brief",
}: Props) {
  const LIVE_FORMAT_MIN_INTERVAL_MS = 1500;

  const [rawInput, setRawInput] = useState("");
  const [docType, setDocType] = useState<NoteType>(defaultDocType);
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [formattingState, setFormattingState] = useState<"idle" | "live" | "final">("idle");

  const recognitionRef = useRef<AnySpeechRecognition>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionPrefixRef = useRef("");
  const sessionRawFinalRef = useRef("");
  const sessionInterimRef = useRef("");
  const formatAbortRef = useRef<AbortController | null>(null);
  const formatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formatRunIdRef = useRef(0);
  const discardSessionRef = useRef(false);
  const didFinalizeSessionRef = useRef(false);
  const activeFormatModeRef = useRef<"live" | "final" | null>(null);
  const queuedLiveDraftRef = useRef("");
  const lastLiveDraftRef = useRef("");
  const lastLiveRequestAtRef = useRef(0);
  const liveCooldownUntilRef = useRef(0);
  const lastCooldownToastAtRef = useRef(0);
  const shouldKeepListeningRef = useRef(false);
  const shouldFinalizeOnEndRef = useRef(false);

  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSpeechSupported(!!SR);
  }, []);

  useEffect(() => {
    const words = rawInput.trim().split(/\s+/).filter(Boolean).length;
    setWordCount(words);
  }, [rawInput]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 320)}px`;
    }
  }, [rawInput, interimTranscript]);

  const cancelScheduledFormat = useCallback(() => {
    if (formatTimerRef.current) {
      clearTimeout(formatTimerRef.current);
      formatTimerRef.current = null;
    }
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const cancelActiveFormat = useCallback((nextState: "idle" | "live" | "final" = "idle") => {
    formatRunIdRef.current += 1;
    formatAbortRef.current?.abort();
    formatAbortRef.current = null;
    activeFormatModeRef.current = null;
    queuedLiveDraftRef.current = "";
    cancelScheduledFormat();
    clearRestartTimer();
    setFormattingState(nextState);
  }, [cancelScheduledFormat, clearRestartTimer]);

  const combineNoteText = useCallback((prefix: string, dictatedText: string) => {
    const cleanDictatedText = dictatedText.trim();
    if (!prefix.trim()) return cleanDictatedText;
    if (!cleanDictatedText) return prefix;

    const needsListBreak = /^([-*] |\d+\. )/.test(cleanDictatedText);
    if (needsListBreak && !prefix.endsWith("\n")) {
      return `${prefix.trimEnd()}\n${cleanDictatedText}`;
    }
    if (prefix.endsWith(" ") || prefix.endsWith("\n")) {
      return `${prefix}${cleanDictatedText}`;
    }
    return `${prefix.trimEnd()} ${cleanDictatedText}`;
  }, []);

  const getRemainingCooldownMs = useCallback(() => {
    return Math.max(0, liveCooldownUntilRef.current - Date.now());
  }, []);

  const parseRetryAfterMs = useCallback((message: string, retryAfterHeader: string | null) => {
    const headerSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
    if (Number.isFinite(headerSeconds) && headerSeconds > 0) {
      return headerSeconds * 1000;
    }

    const match = message.match(/try again in (\d+)s/i);
    if (match) {
      return Number(match[1]) * 1000;
    }

    return 30_000;
  }, []);

  const announceCooldown = useCallback((fallbackMs?: number) => {
    const now = Date.now();
    if (now - lastCooldownToastAtRef.current < 5_000) return;
    lastCooldownToastAtRef.current = now;

    const remainingMs = Math.max(getRemainingCooldownMs(), fallbackMs ?? 0);
    const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
    toast.error(`OpenAI rate-limited. Pausing live cleanup for ${seconds}s.`);
  }, [getRemainingCooldownMs]);

  const getCurrentDraft = useCallback((includeInterim = true) => {
    const finalText = sessionRawFinalRef.current.trim();
    const interimText = includeInterim ? sessionInterimRef.current.trim() : "";

    if (finalText && interimText) return `${finalText} ${interimText}`.trim();
    return (finalText || interimText).trim();
  }, []);

  const streamFormattedDraft = useCallback(async (draftText: string, mode: "live" | "final") => {
    const normalizedDraft = draftText.trim();
    if (!normalizedDraft) {
      setFormattingState("idle");
      setRawInput(sessionPrefixRef.current);
      return;
    }

    const remainingCooldownMs = getRemainingCooldownMs();
    if (remainingCooldownMs > 0) {
      setFormattingState("idle");
      setRawInput(combineNoteText(sessionPrefixRef.current, normalizedDraft));
      if (mode === "final") {
        toast.error("OpenAI rate-limited. Keeping your original wording for now.");
      } else {
        announceCooldown(remainingCooldownMs);
      }
      return;
    }

    if (mode === "live") {
      if (formatAbortRef.current && activeFormatModeRef.current === "live") {
        queuedLiveDraftRef.current = normalizedDraft;
        return;
      }

      if (normalizedDraft === lastLiveDraftRef.current) {
        return;
      }
    }

    const runId = formatRunIdRef.current + 1;
    formatRunIdRef.current = runId;
    if (mode === "final") {
      queuedLiveDraftRef.current = "";
      formatAbortRef.current?.abort();
    }

    const controller = new AbortController();
    formatAbortRef.current = controller;
    activeFormatModeRef.current = mode;
    setFormattingState(mode);

    if (mode === "live") {
      lastLiveDraftRef.current = normalizedDraft;
      lastLiveRequestAtRef.current = Date.now();
    }

    try {
      const res = await fetch("/api/dictation/live-format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dictationText: normalizedDraft,
          existingText: sessionPrefixRef.current,
          noteType: docType,
          mode,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errorText = await res.text();
        let message = `Live formatting failed (${res.status})`;

        if (errorText) {
          try {
            const parsed = JSON.parse(errorText) as { error?: string };
            if (parsed.error) {
              message = parsed.error;
            }
          } catch {
            message = errorText;
          }
        }

        if (res.status === 429) {
          const retryAfterMs = parseRetryAfterMs(message, res.headers.get("Retry-After"));
          liveCooldownUntilRef.current = Math.max(
            liveCooldownUntilRef.current,
            Date.now() + retryAfterMs
          );
          queuedLiveDraftRef.current = "";
        }

        throw new Error(message);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let formatted = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        formatted += decoder.decode(value, { stream: true });
        if (runId !== formatRunIdRef.current) {
          return;
        }

        setRawInput(combineNoteText(sessionPrefixRef.current, formatted));
      }

      if (runId !== formatRunIdRef.current) {
        return;
      }

      setRawInput(combineNoteText(sessionPrefixRef.current, formatted || normalizedDraft));
    } catch (err) {
      if (controller.signal.aborted || runId !== formatRunIdRef.current) {
        return;
      }

      setRawInput(combineNoteText(sessionPrefixRef.current, normalizedDraft));
      if (mode !== "final" && err instanceof Error && /rate limit/i.test(err.message)) {
        announceCooldown();
      }
      if (mode === "final") {
        toast.error(
          err instanceof Error
            ? `${err.message}. Keeping your original wording.`
            : "OpenAI live cleanup failed. Keeping your original wording."
        );
      }
    } finally {
      if (runId === formatRunIdRef.current) {
        formatAbortRef.current = null;
        activeFormatModeRef.current = null;
        setFormattingState("idle");
      }

      if (
        mode === "live" &&
        runId === formatRunIdRef.current &&
        getRemainingCooldownMs() === 0
      ) {
        const queuedDraft = queuedLiveDraftRef.current.trim();
        if (queuedDraft && queuedDraft !== lastLiveDraftRef.current) {
          queuedLiveDraftRef.current = "";
          cancelScheduledFormat();

          const remainingDelay = Math.max(
            0,
            LIVE_FORMAT_MIN_INTERVAL_MS - (Date.now() - lastLiveRequestAtRef.current)
          );

          formatTimerRef.current = setTimeout(() => {
            void streamFormattedDraft(queuedDraft, "live");
          }, remainingDelay);
        }
      }
    }
  }, [
    LIVE_FORMAT_MIN_INTERVAL_MS,
    announceCooldown,
    cancelScheduledFormat,
    combineNoteText,
    docType,
    getRemainingCooldownMs,
    parseRetryAfterMs,
  ]);

  const scheduleLiveFormat = useCallback((draftText: string) => {
    cancelScheduledFormat();

    if (draftText.trim().split(/\s+/).filter(Boolean).length < 2) return;
    if (getRemainingCooldownMs() > 0) return;

    queuedLiveDraftRef.current = draftText;
    const waitMs = Math.max(
      250,
      LIVE_FORMAT_MIN_INTERVAL_MS - (Date.now() - lastLiveRequestAtRef.current)
    );

    formatTimerRef.current = setTimeout(() => {
      const latestDraft = queuedLiveDraftRef.current.trim();
      if (!latestDraft) return;
      queuedLiveDraftRef.current = "";
      void streamFormattedDraft(latestDraft, "live");
    }, waitMs);
  }, [LIVE_FORMAT_MIN_INTERVAL_MS, cancelScheduledFormat, getRemainingCooldownMs, streamFormattedDraft]);

  const finalizeSession = useCallback((includeInterim: boolean) => {
    if (didFinalizeSessionRef.current) return;
    didFinalizeSessionRef.current = true;

    setIsRecording(false);
    cancelScheduledFormat();

    const finalDraft = getCurrentDraft(includeInterim);
    setInterimTranscript("");
    sessionInterimRef.current = "";

    if (discardSessionRef.current) {
      discardSessionRef.current = false;
      setFormattingState("idle");
      setRawInput(sessionPrefixRef.current);
      return;
    }

    if (finalDraft) {
      void streamFormattedDraft(finalDraft, "final");
    } else {
      setFormattingState("idle");
    }
  }, [cancelScheduledFormat, getCurrentDraft, streamFormattedDraft]);

  const createRecognitionSession = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return null;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = "";
      const finalChunks: string[] = [];

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalChunks.push(transcript.trim());
        } else {
          interim += transcript;
        }
      }

      const finalizedChunk = finalChunks.join(" ").trim();
      if (finalizedChunk) {
        sessionRawFinalRef.current = sessionRawFinalRef.current.trim()
          ? `${sessionRawFinalRef.current.trim()} ${finalizedChunk}`.trim()
          : finalizedChunk;
      }

      sessionInterimRef.current = interim.trim();
      setInterimTranscript(sessionInterimRef.current);

      const liveDraft = getCurrentDraft(true);
      setRawInput(combineNoteText(sessionPrefixRef.current, liveDraft));
      scheduleLiveFormat(liveDraft);
    };

    recognition.onerror = (event: AnySpeechRecognition) => {
      if (event?.error === "aborted" || event?.error === "no-speech") {
        return;
      }

      shouldKeepListeningRef.current = false;
      shouldFinalizeOnEndRef.current = true;
      if (event?.error) {
        toast.error(`Microphone error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;

      if (discardSessionRef.current && !shouldFinalizeOnEndRef.current) {
        clearRestartTimer();
        setIsRecording(false);
        setInterimTranscript("");
        return;
      }

      if (shouldKeepListeningRef.current && !shouldFinalizeOnEndRef.current) {
        clearRestartTimer();
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          if (!shouldKeepListeningRef.current || shouldFinalizeOnEndRef.current) return;

          const nextRecognition = createRecognitionSession();
          if (!nextRecognition) return;

          recognitionRef.current = nextRecognition;
          try {
            nextRecognition.start();
          } catch (err) {
            shouldKeepListeningRef.current = false;
            shouldFinalizeOnEndRef.current = true;
            toast.error(
              err instanceof Error
                ? `Microphone error: ${err.message}`
                : "Microphone error: failed to restart dictation."
            );
            finalizeSession(false);
          }
        }, 250);
        return;
      }

      finalizeSession(false);
    };

    return recognition;
  }, [clearRestartTimer, combineNoteText, finalizeSession, getCurrentDraft, scheduleLiveFormat]);

  useEffect(() => {
    return () => {
      shouldKeepListeningRef.current = false;
      shouldFinalizeOnEndRef.current = false;
      recognitionRef.current?.stop();
      cancelActiveFormat();
    };
  }, [cancelActiveFormat]);

  const startRecording = useCallback(() => {
    cancelActiveFormat();
    clearRestartTimer();
    discardSessionRef.current = false;
    didFinalizeSessionRef.current = false;
    shouldKeepListeningRef.current = true;
    shouldFinalizeOnEndRef.current = false;
    sessionPrefixRef.current = rawInput;
    sessionRawFinalRef.current = "";
    sessionInterimRef.current = "";
    setInterimTranscript("");

    const recognition = createRecognitionSession();
    if (!recognition) return;

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [cancelActiveFormat, clearRestartTimer, createRecognitionSession, rawInput]);

  const stopRecording = useCallback(() => {
    shouldKeepListeningRef.current = false;
    shouldFinalizeOnEndRef.current = true;
    clearRestartTimer();
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, [clearRestartTimer]);

  function handleGenerate() {
    const combined = rawInput.trim();
    if (!combined || isGenerating || isRecording || formattingState === "final") return;
    onGenerate(combined, docType);
  }

  function handleClear() {
    discardSessionRef.current = true;
    shouldKeepListeningRef.current = false;
    shouldFinalizeOnEndRef.current = false;
    clearRestartTimer();
    recognitionRef.current?.stop();
    cancelActiveFormat();
    setRawInput("");
    setInterimTranscript("");
    sessionPrefixRef.current = "";
    sessionRawFinalRef.current = "";
    sessionInterimRef.current = "";
    setIsRecording(false);
  }

  const selectedType = TYPE_OPTIONS.find((t) => t.value === docType) ?? TYPE_OPTIONS[0];
  const hasInput = rawInput.trim().length > 0;
  const displayText = rawInput;
  const isLiveFormatting = formattingState === "live";
  const isFinalizing = formattingState === "final";

  return (
    <div className="border-b border-border">
      {/* Type selector + project selector */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border/50">
        {/* Document type dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowTypeDropdown(!showTypeDropdown)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/70 hover:text-foreground transition-colors border border-border px-2.5 py-1.5"
          >
            {selectedType.label}
            <ChevronDown className="w-3 h-3" />
          </button>

          <AnimatePresence>
            {showTypeDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.1 }}
                className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border shadow-xl min-w-[200px]"
              >
                {TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setDocType(opt.value);
                      setShowTypeDropdown(false);
                    }}
                    className={cn(
                      "flex flex-col gap-0.5 w-full text-left px-3 py-2.5 transition-colors hover:bg-accent",
                      docType === opt.value && "bg-accent/60"
                    )}
                  >
                    <span className="text-[12px] font-medium text-foreground">{opt.label}</span>
                    <span className="text-[10px] text-muted-foreground/60">{opt.description}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Click outside to close dropdown */}
        {showTypeDropdown && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowTypeDropdown(false)}
          />
        )}

        {/* Project selector */}
        {projectOptions.length > 0 && (
          <select
            value={selectedProjectId ?? ""}
            onChange={(e) => onProjectChange(e.target.value || null)}
            className="text-[11px] bg-transparent border border-border px-2.5 py-1.5 text-muted-foreground focus:outline-none focus:border-primary transition-colors cursor-pointer"
          >
            <option value="">No project</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.client ? `${p.client} — ${p.title}` : p.title}
              </option>
            ))}
          </select>
        )}

        {/* Word count */}
        {wordCount > 0 && (
          <span className="ml-auto text-[10px] text-muted-foreground/30 tabular-nums">
            {wordCount} {wordCount === 1 ? "word" : "words"}
          </span>
        )}
      </div>

      {/* Main input area */}
      <div className="relative px-6 pt-4 pb-3">
        {/* Recording pulse overlay */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-x-0 top-0 h-0.5 bg-destructive"
              style={{
                background: "linear-gradient(90deg, transparent, oklch(0.55 0.22 25), transparent)",
              }}
            />
          )}
        </AnimatePresence>

        <textarea
          ref={textareaRef}
          value={displayText}
          onChange={(e) => {
            if (isRecording) return;
            cancelActiveFormat();
            discardSessionRef.current = false;
            sessionPrefixRef.current = "";
            sessionRawFinalRef.current = "";
            sessionInterimRef.current = "";
            setInterimTranscript("");
            setRawInput(e.target.value);
          }}
          readOnly={isRecording}
          placeholder={
            isRecording
              ? "Listening… speak your notes"
              : "Type your notes here, or press the mic button to dictate. Be as raw and unstructured as you like — AI will clean it up."
          }
          className={cn(
            "w-full min-h-[120px] max-h-80 bg-transparent text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/25 resize-none focus:outline-none transition-colors",
            isRecording && "text-foreground/80 cursor-not-allowed"
          )}
        />
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 px-6 pb-4">
        {/* Mic button */}
        {speechSupported && (
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isFinalizing}
            className={cn(
              "relative flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium transition-all border",
              isRecording
                ? "border-destructive text-destructive bg-destructive/5 hover:bg-destructive/10"
                : isFinalizing
                ? "border-border text-muted-foreground/40 cursor-not-allowed"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            )}
          >
            {isRecording ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full bg-destructive opacity-75" />
                  <span className="relative inline-flex h-2 w-2 bg-destructive" />
                </span>
                Stop
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" />
                Dictate
              </>
            )}
          </button>
        )}

        {/* Live cleanup indicator */}
        {(isLiveFormatting || isFinalizing) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60"
          >
            <Wand2 className="w-3 h-3 animate-pulse text-primary/60" />
            {isFinalizing ? "Final polish…" : "Tidying as you talk…"}
          </motion.div>
        )}

        {/* Clear */}
        {hasInput && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-muted-foreground/50 hover:text-foreground transition-colors border border-transparent hover:border-border"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
        )}

        {/* Generate */}
        <button
          onClick={handleGenerate}
          disabled={!hasInput || isGenerating || isRecording || isFinalizing}
          className={cn(
            "ml-auto flex items-center gap-2 px-4 py-1.5 text-[12px] font-semibold transition-all",
            hasInput && !isGenerating && !isRecording && !isFinalizing
              ? "bg-primary text-primary-foreground hover:-translate-y-px shadow-sm"
              : "bg-muted text-muted-foreground/40 cursor-not-allowed"
          )}
        >
          <Sparkles className={cn("w-3.5 h-3.5", isGenerating && "animate-pulse")} />
          {isGenerating ? "Generating…" : "Generate Document"}
        </button>
      </div>
    </div>
  );
}
