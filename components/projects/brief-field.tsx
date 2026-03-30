"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveDictation } from "@/hooks/use-live-dictation";

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
  const [isGenerating, setIsGenerating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevValueRef = useRef<string>(""); // for undo on AI failure

  const {
    error,
    isFinalizing,
    isLiveFormatting,
    isRecording,
    setError,
    toggleDictation,
  } = useLiveDictation({
    value,
    onChange,
    contextType: "project-brief",
    minLiveIntervalMs: 900,
  });

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [value]);

  /* ── Craft with Claude ──────────────────────────────── */
  const craftWithClaude = useCallback(async () => {
    if (!value.trim() || isGenerating) return;

    prevValueRef.current = value;
    onChange("");
    setIsGenerating(true);

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
  }, [value, isGenerating, onChange, setError]);

  const busy = isRecording || isGenerating || disabled || isFinalizing;

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
            {isLiveFormatting && !isRecording && (
              <>
                <Loader2 className="w-3 h-3 text-primary/50 animate-spin" />
                <span className="text-[10px] text-primary/50 font-medium">
                  Tidying…
                </span>
              </>
            )}
            {isFinalizing && (
              <>
                <Loader2 className="w-3 h-3 text-primary/50 animate-spin" />
                <span className="text-[10px] text-primary/50 font-medium">
                  Final polish…
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
              onClick={toggleDictation}
              disabled={isGenerating || disabled || isFinalizing}
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
