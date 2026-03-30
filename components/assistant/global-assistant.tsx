"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  X,
  Loader2,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Check,
  Keyboard,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createTaskDirectAction } from "@/app/actions";
import { type AssistantActionPayload, type AssistantIntent } from "@/lib/assistant-contract";
import { useLiveDictation } from "@/hooks/use-live-dictation";

interface Project {
  id: string;
  title: string;
  client: string | null;
}

interface GlobalAssistantProps {
  projects: Project[];
}

type AssistantState = "idle" | "listening" | "processing" | "confirming";

export function GlobalAssistant({ projects }: GlobalAssistantProps) {
  void projects;

  const router = useRouter();
  const pathname = usePathname();

  const [state, setState] = useState<AssistantState>("idle");
  const [transcript, setTranscript] = useState("");
  const [action, setAction] = useState<AssistantActionPayload | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showTextFallback, setShowTextFallback] = useState(false);
  const [textInput, setTextInput] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when text fallback shows
  useEffect(() => {
    if (showTextFallback && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [showTextFallback]);

  const getPageName = useCallback(() => {
    if (pathname.includes("/email")) return "Email Hub";
    if (pathname.includes("/tasks")) return "Tasks";
    if (pathname.includes("/calendar")) return "Calendar";
    if (pathname.includes("/notes")) return "Notes & Briefs";
    if (pathname.includes("/projects")) return "Projects";
    return "Dashboard";
  }, [pathname]);

  const processTranscript = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        setState("idle");
        return;
      }
      setState("processing");
      setShowTextFallback(false);

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: text, page: getPageName() }),
        });
        if (!res.ok) throw new Error("API error");
        const data = await res.json();
        setAction(data as AssistantActionPayload);
        setState("confirming");
      } catch {
        toast.error("Assistant error — please try again");
        setState("idle");
      }
    },
    [getPageName]
  );

  const {
    cancelDictation,
    isFinalizing,
    isLiveFormatting,
    isRecording,
    speechSupported,
    startDictation,
    stopDictation,
  } = useLiveDictation({
    value: transcript,
    onChange: setTranscript,
    contextType: "assistant-command",
    minLiveIntervalMs: 900,
    silenceTimeoutMs: 3000,
    onRecordingStart: () => setState("listening"),
    onFinalized: (value) => {
      const finalText = value.trim();
      if (!finalText) {
        setState("idle");
        return;
      }
      void processTranscript(finalText);
    },
  });

  const dismiss = useCallback(() => {
    cancelDictation();
    setState("idle");
    setAction(null);
    setTranscript("");
    setTextInput("");
    setShowTextFallback(false);
  }, [cancelDictation]);

  const executeAction = useCallback(async () => {
    if (!action) return;
    setIsExecuting(true);

    try {
      switch (action.intent) {
        case "create_task": {
          const { title, project_id, due_date, priority } = action.action_params;
          await createTaskDirectAction({
            title,
            project_id: project_id || null,
            due_date: due_date || null,
            priority: priority || null,
          });
          toast.success(`Task created: "${title}"`);
          dismiss();
          break;
        }

        case "reply_email": {
          const { thread_id, sender_name, subject_hint } = action.action_params;
          sessionStorage.setItem(
            "prdcr_assistant_email",
            JSON.stringify({ type: "reply", thread_id, sender_name, subject_hint })
          );
          dismiss();
          router.push("/dashboard/email");
          break;
        }

        case "compose_email": {
          sessionStorage.setItem(
            "prdcr_assistant_email",
            JSON.stringify({
              type: "compose",
              to: action.action_params.to,
              subject: action.action_params.subject,
              hint: action.action_params.hint,
            })
          );
          dismiss();
          router.push("/dashboard/email");
          break;
        }

        case "add_calendar_event": {
          const { title, date, time, duration, location, notes } = action.action_params;
          const params = new URLSearchParams();
          if (title) params.set("title", title);
          if (date) params.set("date", date);
          if (time) params.set("time", time);
          if (duration) params.set("duration", duration);
          if (location) params.set("location", location);
          if (notes) params.set("notes", notes);
          dismiss();
          router.push(`/dashboard/calendar?${params}`);
          break;
        }

        case "create_note": {
          const { type, title, project_name } = action.action_params;
          const params = new URLSearchParams();
          if (type) params.set("type", type);
          if (title) params.set("title", title);
          if (project_name) params.set("project", project_name);
          dismiss();
          router.push(`/dashboard/notes?${params}`);
          break;
        }

        case "navigate": {
          dismiss();
          router.push(action.action_params.path ?? "/dashboard");
          break;
        }

        case "query_response":
          // Answer is shown inline — no execution needed, just dismiss
          dismiss();
          break;

        case "unknown":
          toast.info("I couldn't complete that action. Try rephrasing.");
          dismiss();
      }
    } catch {
      toast.error("Action failed — please try again");
    } finally {
      setIsExecuting(false);
    }
  }, [action, dismiss, router]);

  const handleMicClick = useCallback(() => {
    if (state === "idle") {
      if (speechSupported) {
        setAction(null);
        setShowTextFallback(false);
        setTranscript("");
        startDictation({ prefix: "" });
      } else {
        setShowTextFallback(true);
        setState("confirming");
      }
    } else if (state === "listening") {
      stopDictation();
    } else {
      dismiss();
    }
  }, [dismiss, speechSupported, startDictation, state, stopDictation]);

  const handleTextSubmit = useCallback(() => {
    const text = textInput.trim();
    if (!text) return;
    setTranscript(text);
    processTranscript(text);
    setTextInput("");
  }, [textInput, processTranscript]);

  function getActionVerb(intent: AssistantIntent) {
    switch (intent) {
      case "create_task":
        return "Create Task";
      case "reply_email":
      case "compose_email":
        return "Open in Email";
      case "add_calendar_event":
        return "Open in Calendar";
      case "create_note":
        return "Open in Notes";
      case "navigate":
        return "Go There";
      default:
        return "Proceed";
    }
  }

  function getActionIcon(intent: AssistantIntent) {
    if (intent === "create_task") return <Check className="w-3.5 h-3.5" />;
    if (intent === "navigate") return <ArrowRight className="w-3.5 h-3.5" />;
    return <ExternalLink className="w-3.5 h-3.5" />;
  }

  const isPanelOpen = state === "confirming" || (state === "processing" && !action);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2.5">
      {/* Confirmation / input panel */}
      <AnimatePresence>
        {isPanelOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="w-[340px] bg-background/92 backdrop-blur-2xl border border-border/60 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3 h-3 text-muted-foreground" />
                <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                  Executive Assistant
                </span>
              </div>
              <button
                onClick={dismiss}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Processing */}
              {state === "processing" && !action && (
                <div className="flex items-center gap-3 py-1">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground">Processing your request...</span>
                </div>
              )}

              {/* Text fallback input */}
              {showTextFallback && !action && (
                <div className="space-y-2.5">
                  <p className="text-xs text-muted-foreground">What would you like to do?</p>
                  <textarea
                    ref={textareaRef}
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleTextSubmit();
                      }
                    }}
                    placeholder="e.g. Create task: review Nike edit, due Friday..."
                    className="w-full text-sm bg-transparent border border-border/50 px-3 py-2 resize-none focus:outline-none focus:border-border/80 placeholder:text-muted-foreground/40 font-mono leading-relaxed"
                    rows={3}
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground/60">Enter to submit</p>
                    <button
                      onClick={handleTextSubmit}
                      disabled={!textInput.trim()}
                      className="px-3 py-1.5 text-xs bg-foreground text-background font-medium disabled:opacity-40 hover:bg-foreground/85 transition-colors"
                    >
                      Process
                    </button>
                  </div>
                </div>
              )}

              {/* Query answer — no confirm step, just show the answer */}
              {action && state === "confirming" && action.intent === "query_response" && (
                <>
                  {transcript && (
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                        You asked
                      </p>
                      <p className="text-sm text-foreground/60 italic leading-relaxed">
                        &ldquo;{transcript}&rdquo;
                      </p>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                      Answer
                    </p>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                      {action.action_params.answer || action.summary}
                    </p>
                  </div>
                  <button
                    onClick={dismiss}
                    className="w-full text-xs py-2 border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                  >
                    Got it
                  </button>
                </>
              )}

              {/* Action confirmation */}
              {action && state === "confirming" && action.intent !== "query_response" && (
                <>
                  {transcript && (
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                        You said
                      </p>
                      <p className="text-sm text-foreground/70 italic leading-relaxed">
                        &ldquo;{transcript}&rdquo;
                      </p>
                    </div>
                  )}

                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                      Proposed action
                    </p>
                    <p className="text-sm text-foreground leading-relaxed">{action.summary}</p>
                  </div>

                  <div className="flex gap-2 pt-0.5">
                    <button
                      onClick={dismiss}
                      className="text-xs py-2 px-3 border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                    >
                      Cancel
                    </button>
                    {action.intent === "unknown" ? (
                      <button
                        onClick={() => {
                          dismiss();
                          // Re-open with text input to rephrase
                          setShowTextFallback(true);
                          setState("confirming");
                        }}
                        className="flex-1 text-xs py-2 border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                      >
                        Try again
                      </button>
                    ) : (
                      <button
                        onClick={executeAction}
                        disabled={isExecuting}
                        className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 bg-foreground text-background font-medium hover:bg-foreground/85 disabled:opacity-50 transition-colors"
                      >
                        {isExecuting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          getActionIcon(action.intent)
                        )}
                        {isExecuting ? "Working..." : getActionVerb(action.intent)}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interim transcript bubble (listening state) */}
      <AnimatePresence>
        {state === "listening" && (
          <motion.div
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 6 }}
            className="flex items-center gap-2 bg-background/90 backdrop-blur-xl border border-border/50 px-3 py-2 shadow-lg max-w-[300px] mr-1"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-foreground animate-pulse shrink-0" />
            <span className="text-xs text-muted-foreground flex-1 min-w-0 line-clamp-2 leading-relaxed">
              {transcript
                ? transcript
                : isFinalizing
                  ? "Final polish…"
                  : isLiveFormatting
                    ? "Tidying your command…"
                    : "Listening…"}
            </span>
            <button
              onClick={stopDictation}
              disabled={!isRecording}
              className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-foreground bg-foreground/10 hover:bg-foreground/20 px-2 py-0.5 transition-colors ml-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isRecording ? "Done" : "Polishing"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main floating button */}
      <div className="flex items-center gap-2">
        {/* Keyboard fallback button (when speech not supported and idle) */}
        {!speechSupported && state === "idle" && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => {
              setShowTextFallback(true);
              setState("confirming");
            }}
            className="h-9 px-3 flex items-center gap-1.5 text-xs text-muted-foreground bg-background/85 backdrop-blur-xl border border-border/50 hover:text-foreground hover:border-border shadow-lg transition-colors"
            title="Type a command"
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span className="font-medium">Type</span>
          </motion.button>
        )}

        <motion.button
          onClick={handleMicClick}
          className={cn(
            "w-12 h-12 flex items-center justify-center shadow-xl transition-colors border",
            state === "idle" &&
              "bg-background/85 backdrop-blur-xl border-border/50 text-foreground hover:bg-background hover:border-border",
            state === "listening" && "bg-foreground border-foreground text-background",
            (state === "processing" || state === "confirming") &&
              "bg-background/85 backdrop-blur-xl border-border/50 text-foreground"
          )}
          animate={
            state === "listening"
              ? { scale: [1, 1.07, 1], boxShadow: ["0 0 0 0px rgba(0,0,0,0.1)", "0 0 0 6px rgba(0,0,0,0.06)", "0 0 0 0px rgba(0,0,0,0.1)"] }
              : { scale: 1 }
          }
          transition={
            state === "listening"
              ? { repeat: Infinity, duration: 1.4, ease: "easeInOut" }
              : { duration: 0.15 }
          }
          aria-label={
            state === "idle"
              ? "Open executive assistant"
              : state === "listening"
              ? isRecording
                ? "Listening — click to stop"
                : "Tidying your command"
              : "Close assistant"
          }
          title={
            state === "idle"
              ? "Executive assistant"
              : state === "listening"
              ? isRecording
                ? "Listening... click to stop"
                : isFinalizing
                  ? "Final polish in progress"
                  : "Tidying your command"
              : ""
          }
        >
          {state === "processing" ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : state === "listening" && (isLiveFormatting || isFinalizing) && !isRecording ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : state === "listening" ? (
            <MicOff className="w-5 h-5" />
          ) : (
            <Mic className="w-5 h-5" />
          )}
        </motion.button>
      </div>
    </div>
  );
}
