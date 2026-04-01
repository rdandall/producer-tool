"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

interface UseLiveDictationOptions {
  value: string;
  onChange: (value: string) => void;
  contextType: string;
  minLiveWords?: number;
  minLiveIntervalMs?: number;
  enableFinalPolish?: boolean;
  silenceTimeoutMs?: number | null;
  onFinalized?: (value: string) => void;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
}

export function useLiveDictation({
  value,
  onChange,
  contextType,
  minLiveWords = 2,
  minLiveIntervalMs = 1500,
  enableFinalPolish = true,
  silenceTimeoutMs = null,
  onFinalized,
  onRecordingStart,
  onRecordingStop,
}: UseLiveDictationOptions) {
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [formattingState, setFormattingState] = useState<"idle" | "live" | "final">("idle");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<AnySpeechRecognition>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onFinalizedRef = useRef(onFinalized);
  const onRecordingStartRef = useRef(onRecordingStart);
  const onRecordingStopRef = useRef(onRecordingStop);
  const contextTypeRef = useRef(contextType);

  const sessionPrefixRef = useRef("");
  const sessionRawFinalRef = useRef("");
  const sessionInterimRef = useRef("");
  const sessionOnChangeRef = useRef(onChange);
  const sessionOnFinalizedRef = useRef(onFinalized);
  const sessionContextTypeRef = useRef(contextType);

  const formatAbortRef = useRef<AbortController | null>(null);
  const formatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formatRunIdRef = useRef(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    valueRef.current = value;
    onChangeRef.current = onChange;
    onFinalizedRef.current = onFinalized;
    onRecordingStartRef.current = onRecordingStart;
    onRecordingStopRef.current = onRecordingStop;
    contextTypeRef.current = contextType;
  }, [contextType, onChange, onFinalized, onRecordingStart, onRecordingStop, value]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const cancelScheduledFormat = useCallback(() => {
    if (formatTimerRef.current) {
      clearTimeout(formatTimerRef.current);
      formatTimerRef.current = null;
    }
  }, []);

  const cancelActiveFormat = useCallback((nextState: "idle" | "live" | "final" = "idle") => {
    formatRunIdRef.current += 1;
    formatAbortRef.current?.abort();
    formatAbortRef.current = null;
    activeFormatModeRef.current = null;
    queuedLiveDraftRef.current = "";
    cancelScheduledFormat();
    clearSilenceTimer();
    clearRestartTimer();
    setFormattingState(nextState);
  }, [cancelScheduledFormat, clearRestartTimer, clearSilenceTimer]);

  const combineText = useCallback((prefix: string, dictatedText: string) => {
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

  const applyDraft = useCallback((dictatedText: string) => {
    const combined = combineText(sessionPrefixRef.current, dictatedText);
    sessionOnChangeRef.current(combined);
    return combined;
  }, [combineText]);

  const getCurrentDraft = useCallback((includeInterim = true) => {
    const finalText = sessionRawFinalRef.current.trim();
    const interimText = includeInterim ? sessionInterimRef.current.trim() : "";

    if (finalText && interimText) return `${finalText} ${interimText}`.trim();
    return (finalText || interimText).trim();
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

  const finishSession = useCallback((combined: string) => {
    sessionOnFinalizedRef.current?.(combined);
    onRecordingStopRef.current?.();
  }, []);

  const streamFormattedDraft = useCallback(async (draftText: string, mode: "live" | "final") => {
    const normalizedDraft = draftText.trim();
    if (!normalizedDraft) {
      setFormattingState("idle");
      sessionOnChangeRef.current(sessionPrefixRef.current);
      if (mode === "final") {
        finishSession(sessionPrefixRef.current);
      }
      return;
    }

    const remainingCooldownMs = getRemainingCooldownMs();
    if (remainingCooldownMs > 0) {
      setFormattingState("idle");
      const combined = applyDraft(normalizedDraft);
      if (mode === "final") {
        toast.error("OpenAI rate-limited. Keeping your original wording for now.");
        finishSession(combined);
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
          contextType: sessionContextTypeRef.current,
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
        const { done, value: chunk } = await reader.read();
        if (done) break;

        formatted += decoder.decode(chunk, { stream: true });
        if (runId !== formatRunIdRef.current) {
          return;
        }

        applyDraft(formatted);
      }

      if (runId !== formatRunIdRef.current) {
        return;
      }

      const combined = applyDraft(formatted || normalizedDraft);
      if (mode === "final") {
        finishSession(combined);
      }
    } catch (err) {
      if (controller.signal.aborted || runId !== formatRunIdRef.current) {
        return;
      }

      const combined = applyDraft(normalizedDraft);
      if (mode !== "final" && err instanceof Error && /rate limit/i.test(err.message)) {
        announceCooldown();
      }
      if (mode === "final") {
        toast.error(
          err instanceof Error
            ? `${err.message}. Keeping your original wording.`
            : "OpenAI live cleanup failed. Keeping your original wording."
        );
        finishSession(combined);
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
            minLiveIntervalMs - (Date.now() - lastLiveRequestAtRef.current)
          );

          formatTimerRef.current = setTimeout(() => {
            void streamFormattedDraft(queuedDraft, "live");
          }, remainingDelay);
        }
      }
    }
  }, [
    announceCooldown,
    applyDraft,
    cancelScheduledFormat,
    finishSession,
    getRemainingCooldownMs,
    minLiveIntervalMs,
    parseRetryAfterMs,
  ]);

  const scheduleLiveFormat = useCallback((draftText: string) => {
    cancelScheduledFormat();

    if (draftText.trim().split(/\s+/).filter(Boolean).length < minLiveWords) return;
    if (getRemainingCooldownMs() > 0) return;

    queuedLiveDraftRef.current = draftText;
    const waitMs = Math.max(
      250,
      minLiveIntervalMs - (Date.now() - lastLiveRequestAtRef.current)
    );

    formatTimerRef.current = setTimeout(() => {
      const latestDraft = queuedLiveDraftRef.current.trim();
      if (!latestDraft) return;
      queuedLiveDraftRef.current = "";
      void streamFormattedDraft(latestDraft, "live");
    }, waitMs);
  }, [cancelScheduledFormat, getRemainingCooldownMs, minLiveIntervalMs, minLiveWords, streamFormattedDraft]);

  const finalizeSession = useCallback((includeInterim: boolean) => {
    if (didFinalizeSessionRef.current) return;
    didFinalizeSessionRef.current = true;

    setIsRecording(false);
    clearSilenceTimer();
    cancelScheduledFormat();

    const finalDraft = getCurrentDraft(includeInterim);
    sessionInterimRef.current = "";

    if (discardSessionRef.current) {
      discardSessionRef.current = false;
      setFormattingState("idle");
      sessionOnChangeRef.current(sessionPrefixRef.current);
      onRecordingStopRef.current?.();
      return;
    }

    if (!finalDraft) {
      setFormattingState("idle");
      onRecordingStopRef.current?.();
      return;
    }

    if (!enableFinalPolish) {
      const combined = applyDraft(finalDraft);
      setFormattingState("idle");
      finishSession(combined);
      return;
    }

    void streamFormattedDraft(finalDraft, "final");
  }, [
    applyDraft,
    cancelScheduledFormat,
    clearSilenceTimer,
    enableFinalPolish,
    finishSession,
    getCurrentDraft,
    streamFormattedDraft,
  ]);

  const resetSilenceTimer = useCallback(() => {
    if (!silenceTimeoutMs || silenceTimeoutMs <= 0) return;
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      shouldKeepListeningRef.current = false;
      shouldFinalizeOnEndRef.current = true;
      recognitionRef.current?.stop();
    }, silenceTimeoutMs);
  }, [clearSilenceTimer, silenceTimeoutMs]);

  const createRecognitionSession = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) {
      const message = "Speech recognition is not supported in this browser.";
      setError(message);
      toast.error(message);
      shouldKeepListeningRef.current = false;
      shouldFinalizeOnEndRef.current = false;
      return null;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: AnySpeechRecognition) => {
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
      const liveDraft = getCurrentDraft(true);
      applyDraft(liveDraft);
      scheduleLiveFormat(liveDraft);
      resetSilenceTimer();
    };

    recognition.onerror = (event: AnySpeechRecognition) => {
      if (event?.error === "aborted" || event?.error === "no-speech") {
        return;
      }

      shouldKeepListeningRef.current = false;
      shouldFinalizeOnEndRef.current = true;

      if (event?.error === "not-allowed" || event?.error === "service-not-allowed") {
        setError("Microphone access was denied. Check browser permissions and try again.");
      } else if (event?.error) {
        setError(`Microphone error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;

      if (discardSessionRef.current && !shouldFinalizeOnEndRef.current) {
        clearSilenceTimer();
        clearRestartTimer();
        setIsRecording(false);
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
            resetSilenceTimer();
          } catch (err) {
            shouldKeepListeningRef.current = false;
            shouldFinalizeOnEndRef.current = true;
            setError(
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
  }, [
    applyDraft,
    clearRestartTimer,
    clearSilenceTimer,
    finalizeSession,
    getCurrentDraft,
    resetSilenceTimer,
    scheduleLiveFormat,
  ]);

  const startDictation = useCallback((options?: { prefix?: string }) => {
    cancelActiveFormat();
    clearRestartTimer();
    discardSessionRef.current = false;
    didFinalizeSessionRef.current = false;
    shouldKeepListeningRef.current = true;
    shouldFinalizeOnEndRef.current = false;
    sessionPrefixRef.current = options?.prefix ?? valueRef.current;
    sessionRawFinalRef.current = "";
    sessionInterimRef.current = "";
    sessionOnChangeRef.current = onChangeRef.current;
    sessionOnFinalizedRef.current = onFinalizedRef.current;
    sessionContextTypeRef.current = contextTypeRef.current;
    setError(null);

    const recognition = createRecognitionSession();
    if (!recognition) return;

    recognitionRef.current = recognition;
    recognition.start();
    resetSilenceTimer();
    setIsRecording(true);
    onRecordingStartRef.current?.();
  }, [
    cancelActiveFormat,
    clearRestartTimer,
    createRecognitionSession,
    resetSilenceTimer,
  ]);

  const stopDictation = useCallback(() => {
    clearSilenceTimer();
    clearRestartTimer();
    shouldKeepListeningRef.current = false;
    shouldFinalizeOnEndRef.current = true;
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, [clearRestartTimer, clearSilenceTimer]);

  const cancelDictation = useCallback(() => {
    discardSessionRef.current = true;
    shouldKeepListeningRef.current = false;
    shouldFinalizeOnEndRef.current = false;
    clearRestartTimer();
    clearSilenceTimer();
    recognitionRef.current?.abort();
    sessionRawFinalRef.current = "";
    sessionInterimRef.current = "";
    sessionOnChangeRef.current(sessionPrefixRef.current);
    cancelActiveFormat();
    setIsRecording(false);
    onRecordingStopRef.current?.();
  }, [cancelActiveFormat, clearRestartTimer, clearSilenceTimer]);

  const toggleDictation = useCallback(() => {
    if (isRecording) {
      stopDictation();
      return;
    }
    startDictation();
  }, [isRecording, startDictation, stopDictation]);

  useEffect(() => {
    return () => {
      shouldKeepListeningRef.current = false;
      shouldFinalizeOnEndRef.current = false;
      recognitionRef.current?.abort();
      cancelActiveFormat();
    };
  }, [cancelActiveFormat]);

  return {
    error,
    isFinalizing: formattingState === "final",
    isLiveFormatting: formattingState === "live",
    isRecording,
    setError,
    speechSupported,
    cancelDictation,
    startDictation,
    stopDictation,
    toggleDictation,
  };
}
