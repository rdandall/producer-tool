"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Sparkles, Trash2, ChevronDown, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoteType } from "@/lib/db/notes";

const TYPE_OPTIONS: { value: NoteType; label: string; description: string }[] = [
  { value: "brief",         label: "Edit Brief",     description: "Instructions for your editor" },
  { value: "meeting-notes", label: "Meeting Notes",  description: "Call or meeting summary" },
  { value: "project-notes", label: "Project Notes",  description: "General project notes" },
  { value: "client-brief",  label: "Client Brief",   description: "Client-facing document" },
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
  const [rawInput, setRawInput] = useState("");
  const [docType, setDocType] = useState<NoteType>(defaultDocType);
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [isEnhancing, setIsEnhancing] = useState(false);

  const recognitionRef = useRef<AnySpeechRecognition>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const enhanceTranscript = useCallback(async (text: string) => {
    if (!text.trim() || text.trim().split(/\s+/).length < 5) return; // skip very short text
    setIsEnhancing(true);
    try {
      const res = await fetch("/api/dictation/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.enhanced && data.enhanced !== text) {
        setRawInput(data.enhanced);
      }
    } catch {
      // silent — fall back to raw transcript
    } finally {
      setIsEnhancing(false);
    }
  }, []);

  const startRecording = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    // Accumulate final text in a closure variable (not state) so onend can read it
    let sessionFinal = "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = "";
      let finalChunk = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalChunk += transcript + " ";
        } else {
          interim += transcript;
        }
      }

      if (finalChunk) {
        sessionFinal += finalChunk;
        setRawInput((prev) => prev + finalChunk);
        setInterimTranscript("");
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = () => {
      setIsRecording(false);
      setInterimTranscript("");
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInterimTranscript("");
      // Auto-enhance the dictated text when recording stops
      const fullText = sessionFinal.trim();
      if (fullText) enhanceTranscript(fullText);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [enhanceTranscript]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    setIsRecording(false);
    setInterimTranscript("");
  }, []);

  function handleGenerate() {
    const combined = (rawInput + (interimTranscript ? " " + interimTranscript : "")).trim();
    if (!combined || isGenerating) return;
    if (isRecording) stopRecording();
    onGenerate(combined, docType);
  }

  function handleClear() {
    if (isRecording) stopRecording();
    setRawInput("");
    setInterimTranscript("");
  }

  const selectedType = TYPE_OPTIONS.find((t) => t.value === docType) ?? TYPE_OPTIONS[0];
  const hasInput = rawInput.trim().length > 0 || interimTranscript.trim().length > 0;
  const displayText = rawInput + (interimTranscript ? interimTranscript : "");

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
            if (!isRecording) setRawInput(e.target.value);
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

        {/* Interim transcript indicator */}
        <AnimatePresence>
          {interimTranscript && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[12px] text-muted-foreground/40 italic mt-1"
            >
              {interimTranscript}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 px-6 pb-4">
        {/* Mic button */}
        {speechSupported && (
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isEnhancing}
            className={cn(
              "relative flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium transition-all border",
              isRecording
                ? "border-destructive text-destructive bg-destructive/5 hover:bg-destructive/10"
                : isEnhancing
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

        {/* Smart enhance indicator */}
        {isEnhancing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60"
          >
            <Wand2 className="w-3 h-3 animate-pulse text-primary/60" />
            Cleaning up…
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
          disabled={!hasInput || isGenerating}
          className={cn(
            "ml-auto flex items-center gap-2 px-4 py-1.5 text-[12px] font-semibold transition-all",
            hasInput && !isGenerating
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
