"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionCtor = new () => any;
declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionCtor;
    webkitSpeechRecognition: SpeechRecognitionCtor;
  }
}

interface BriefFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}

export function BriefField({
  value,
  onChange,
  placeholder = "Describe the project, or hit the mic to talk through it…",
  rows = 4,
  disabled = false,
}: BriefFieldProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevValueRef = useRef<string>(""); // for undo on AI failure

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [value]);

  /* ── Speech recognition ─────────────────────────────── */
  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    // Request mic permission explicitly
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      setError(
        "Microphone blocked — click the lock icon in your address bar → allow microphone, then try again."
      );
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Voice input needs Chrome or Edge.");
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    recognitionRef.current = rec;

    let finalTranscript = value; // append to existing text

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscript += t + " ";
        else interim = t;
      }
      onChange(finalTranscript + interim);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed") {
        setError(
          "Microphone blocked — click the lock icon in your address bar → allow microphone, then try again."
        );
      } else {
        setError(`Mic error: ${e.error}`);
      }
      setIsRecording(false);
    };

    rec.onend = () => setIsRecording(false);

    rec.start();
    setIsRecording(true);
    setError(null);
  }, [isRecording, value, onChange]);

  /* ── Craft with Claude ──────────────────────────────── */
  const craftWithClaude = useCallback(async () => {
    if (!value.trim() || isGenerating) return;

    prevValueRef.current = value;
    onChange("");
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: value.trim(), currentBrief: "" }),
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let result = "";

      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        result += decoder.decode(chunk, { stream: true });
        onChange(result);
      }
    } catch (err) {
      onChange(prevValueRef.current);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  }, [value, isGenerating, onChange]);

  const busy = isRecording || isGenerating || disabled;

  return (
    <div className="space-y-1">
      <div
        className={cn(
          "relative border transition-colors",
          isRecording
            ? "border-destructive/40 bg-destructive/[0.03]"
            : isGenerating
              ? "border-primary/40 bg-primary/[0.03]"
              : "border-border/60 hover:border-border focus-within:border-primary/50 bg-background/40"
        )}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={isGenerating || disabled}
          placeholder={isRecording ? "Listening… speak now" : placeholder}
          rows={rows}
          className={cn(
            "w-full text-sm text-foreground/85 leading-relaxed bg-transparent",
            "resize-none focus:outline-none px-3 pt-2.5 pb-8",
            "placeholder:text-muted-foreground/30 disabled:opacity-60"
          )}
        />

        {/* Bottom bar — icons + status */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 pb-1.5">
          {/* Status text */}
          <div className="flex items-center gap-1.5">
            {isRecording && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                <span className="text-[10px] text-destructive/60 font-medium">
                  Listening…
                </span>
              </>
            )}
            {isGenerating && (
              <>
                <Loader2 className="w-3 h-3 text-primary/50 animate-spin" />
                <span className="text-[10px] text-primary/50 font-medium">
                  Writing…
                </span>
              </>
            )}
          </div>

          {/* Action icons */}
          <div className="flex items-center gap-1">
            {/* Mic */}
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isGenerating || disabled}
              title={isRecording ? "Stop recording" : "Record voice"}
              className={cn(
                "w-6 h-6 flex items-center justify-center rounded transition-all",
                isRecording
                  ? "text-destructive animate-pulse"
                  : "text-muted-foreground/40 hover:text-foreground/70",
                "disabled:opacity-30 disabled:cursor-not-allowed"
              )}
            >
              {isRecording ? (
                <MicOff className="w-3.5 h-3.5" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Sparkles / Claude */}
            <button
              type="button"
              onClick={craftWithClaude}
              disabled={!value.trim() || busy}
              title="Craft brief with Claude"
              className={cn(
                "w-6 h-6 flex items-center justify-center rounded transition-all",
                isGenerating
                  ? "text-primary/50"
                  : value.trim() && !busy
                    ? "text-muted-foreground/40 hover:text-primary/70"
                    : "text-muted-foreground/20 cursor-not-allowed",
                "disabled:opacity-30 disabled:cursor-not-allowed"
              )}
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
