"use client";

import { useRef, useState, useCallback } from "react";
import { Send, Zap, X, Settings, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { StoredEmail } from "@/lib/db/emails";
import { ResponseVariants, type VariantType, type Variants } from "./response-variants";
import { SmartInsertsSidebar } from "./smart-inserts-sidebar";

interface SmartInsert {
  label: string;
  text: string;
}

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
  projects: Project[];
  phases: Phase[];
  tasks: Task[];
  hasToneProfile: boolean;
  onClose: () => void;
  onPhaseSignal: (signal: PhaseSignalResult) => void;
  onMentionedDates: (dates: Array<{ raw: string; iso: string | null; context: string }>) => void;
}

const EMPTY_VARIANTS: Variants = { punchy: "", balanced: "", detailed: "" };

export function EmailComposePanel({
  threadMessages,
  projects,
  phases,
  tasks,
  hasToneProfile,
  onClose,
  onPhaseSignal,
  onMentionedDates,
}: EmailComposePanelProps) {
  const [variants, setVariants] = useState<Variants>(EMPTY_VARIANTS);
  const [smartInserts, setSmartInserts] = useState<SmartInsert[]>([]);
  const [activeVariant, setActiveVariant] = useState<VariantType>("balanced");
  const [generating, setGenerating] = useState(false);
  const [regenLoading, setRegenLoading] = useState<VariantType | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [showStyleNote, setShowStyleNote] = useState(false);
  const [styleNote, setStyleNote] = useState("");

  // insertRef is passed to ResponseVariants to expose the cursor-aware insert function
  const insertRef = useRef<((text: string) => void) | null>(null);

  // Find most likely project from thread context
  const inferredProject = useCallback(() => {
    const threadText = threadMessages.map((m) => m.body_text ?? m.snippet ?? "").join(" ");
    const subject = threadMessages[0]?.subject ?? "";
    return projects.find(
      (p) =>
        threadText.toLowerCase().includes(p.title.toLowerCase()) ||
        (p.client && threadText.toLowerCase().includes(p.client.toLowerCase())) ||
        subject.toLowerCase().includes(p.title.toLowerCase())
    );
  }, [threadMessages, projects]);

  async function handleGenerate() {
    if (!threadMessages.length) return;
    setGenerating(true);

    try {
      const project = inferredProject();
      const relevantPhases = project
        ? phases.filter((ph) => ph.project_id === project.id)
        : [];
      const relevantTasks = project
        ? tasks.filter((t) => t.project_id === project.id)
        : [];

      const res = await fetch("/api/email/generate-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread: threadMessages,
          projectContext: project ?? null,
          phases: relevantPhases,
          tasks: relevantTasks,
        }),
      });

      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();

      setVariants({
        punchy: data.variants?.punchy ?? "",
        balanced: data.variants?.balanced ?? "",
        detailed: data.variants?.detailed ?? "",
      });
      setSmartInserts(data.smartInserts ?? []);

      if (data.phaseSignal?.detected) {
        onPhaseSignal(data.phaseSignal);
      }
      if (data.mentionedDates?.length) {
        onMentionedDates(data.mentionedDates);
      }
    } catch (err) {
      toast.error("Failed to generate response. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegen(type: VariantType) {
    if (!threadMessages.length) return;
    setRegenLoading(type);

    try {
      const project = inferredProject();
      const relevantPhases = project
        ? phases.filter((ph) => ph.project_id === project.id)
        : [];

      const res = await fetch("/api/email/generate-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread: threadMessages,
          projectContext: project ?? null,
          phases: relevantPhases,
          tasks: [],
          variantType: type,
        }),
      });

      if (!res.ok) throw new Error("Regeneration failed");
      const data = await res.json();

      const newContent = data.variants?.[type];
      if (newContent) {
        setVariants((prev) => ({ ...prev, [type]: newContent }));
        toast.success(`${type} variant regenerated`);
      }
    } catch {
      toast.error("Regeneration failed. Try again.");
    } finally {
      setRegenLoading(null);
    }
  }

  async function handleSend() {
    const body = variants[activeVariant];
    if (!body.trim()) {
      toast.error("Write or generate a reply first.");
      return;
    }

    const latestMsg = threadMessages[threadMessages.length - 1];
    if (!latestMsg) return;

    setIsSending(true);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: latestMsg.from_email,
          subject: latestMsg.subject,
          emailBody: body,
          threadId: latestMsg.gmail_thread_id,
        }),
      });

      if (!res.ok) throw new Error("Send failed");
      toast.success("Reply sent");
      onClose();
    } catch (err) {
      toast.error("Failed to send. Check your Gmail connection.");
    } finally {
      setIsSending(false);
    }
  }

  async function handleSaveStyleNote() {
    await fetch("/api/email/style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ styleNote }),
    });
    toast.success("Style note saved");
    setShowStyleNote(false);
  }

  const hasVariants = variants.punchy || variants.balanced || variants.detailed;
  const latestMsg = threadMessages[threadMessages.length - 1];

  return (
    <div className="flex flex-col h-full border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">
            Re: {latestMsg?.subject ?? "(No subject)"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            → {latestMsg?.from_email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStyleNote((v) => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Edit style note"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Style note editor (collapsible) */}
      {showStyleNote && (
        <div className="px-4 py-3 border-b border-border bg-sidebar-accent/20 shrink-0 space-y-2">
          <p className="text-xs font-medium text-foreground">Personal style note</p>
          <p className="text-[11px] text-muted-foreground">
            Describe how you like to write. This supplements the AI&apos;s analysis of your
            email history.
          </p>
          <textarea
            rows={3}
            value={styleNote}
            onChange={(e) => setStyleNote(e.target.value)}
            placeholder="e.g. Keep it direct, use casual language, always end with a clear next step..."
            className="w-full text-xs bg-sidebar-accent/40 border border-border p-2 text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-primary/50"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSaveStyleNote}
              className="text-xs bg-foreground text-background px-3 py-1.5 hover:opacity-90 transition-opacity"
            >
              Save note
            </button>
            <button
              onClick={() => setShowStyleNote(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          {!hasToneProfile && (
            <p className="text-[11px] text-amber-400">
              No tone profile yet.{" "}
              <button
                className="underline hover:no-underline"
                onClick={async () => {
                  toast.info("Analyzing your sent emails...");
                  const res = await fetch("/api/email/analyze-tone", {
                    method: "POST",
                  });
                  if (res.ok) {
                    const d = await res.json();
                    toast.success(`Tone profile built from ${d.sampleCount} sent emails.`);
                  } else {
                    toast.error("Tone analysis failed.");
                  }
                }}
              >
                Analyze my email history
              </button>
            </p>
          )}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Generate button */}
        {!hasVariants && !generating && (
          <button
            onClick={handleGenerate}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            <Zap className="w-4 h-4" />
            Generate reply variants
          </button>
        )}

        {hasVariants && !generating && (
          <button
            onClick={handleGenerate}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            Regenerate all variants
          </button>
        )}

        {/* Variants */}
        <ResponseVariants
          variants={variants}
          activeVariant={activeVariant}
          generating={generating}
          regenLoading={regenLoading}
          onVariantChange={(type, value) =>
            setVariants((prev) => ({ ...prev, [type]: value }))
          }
          onActiveVariantChange={setActiveVariant}
          onRegen={handleRegen}
          insertRef={insertRef}
        />

        {/* Smart inserts */}
        {(hasVariants || generating) && (
          <SmartInsertsSidebar
            inserts={smartInserts}
            generating={generating}
            onInsert={(text) => insertRef.current?.(text)}
          />
        )}
      </div>

      {/* Send footer */}
      <div className="px-4 py-3 border-t border-border shrink-0 flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted-foreground">
          Sending{" "}
          <span className="font-medium text-foreground capitalize">{activeVariant}</span>
          {" variant"}
        </span>
        <button
          onClick={handleSend}
          disabled={isSending || !variants[activeVariant].trim()}
          className="flex items-center gap-2 text-xs font-medium bg-foreground text-background px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {isSending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          Send reply
        </button>
      </div>
    </div>
  );
}
