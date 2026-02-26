"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { updateProjectBriefAction } from "@/app/actions";
import { BriefField } from "./brief-field";

interface Props {
  projectId: string;
  initialBrief: string | null;
}

export function BriefEditor({ projectId, initialBrief }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(initialBrief ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaveTransition] = useTransition();

  function startEditing() {
    setDraft(initialBrief ?? "");
    setIsEditing(true);
    setError(null);
  }

  function cancelEditing() {
    setDraft(initialBrief ?? "");
    setIsEditing(false);
    setError(null);
  }

  function saveBrief() {
    startSaveTransition(async () => {
      try {
        await updateProjectBriefAction(projectId, draft);
        setIsEditing(false);
        setError(null);
        toast.success("Brief saved");
      } catch {
        setError("Failed to save.");
      }
    });
  }

  /* ── View mode ─────────────────────────────────────── */
  if (!isEditing) {
    return (
      <div className="group relative">
        {initialBrief ? (
          <>
            <p className="text-[15px] text-foreground/85 leading-relaxed pr-8">
              {initialBrief}
            </p>
            <button
              onClick={startEditing}
              className="absolute top-0 right-0 p-1 text-muted-foreground/30 hover:text-foreground/60 transition-colors opacity-0 group-hover:opacity-100"
              title="Edit brief"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <button
            onClick={startEditing}
            className="flex items-center gap-1.5 text-sm text-muted-foreground/50 hover:text-foreground/60 transition-colors py-2"
          >
            <Plus className="w-3.5 h-3.5" />
            Add a brief
          </button>
        )}
      </div>
    );
  }

  /* ── Edit mode ─────────────────────────────────────── */
  return (
    <div className="space-y-2">
      <BriefField
        value={draft}
        onChange={setDraft}
        placeholder="Describe the project, or hit the mic to talk through it…"
        rows={4}
        disabled={isSaving}
      />

      <div className="flex items-center gap-2">
        <button
          onClick={saveBrief}
          disabled={isSaving}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider",
            "bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          )}
        >
          {isSaving ? (
            <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
          ) : (
            <><Check className="w-3 h-3" /> Save</>
          )}
        </button>
        <button
          onClick={cancelEditing}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <X className="w-3 h-3" /> Cancel
        </button>
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
