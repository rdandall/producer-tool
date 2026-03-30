"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createPhaseAction } from "@/app/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Mic, MicOff, Plus, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveDictation } from "@/hooks/use-live-dictation";

interface Props {
  projectId: string;
}

const fieldClass =
  "w-full text-sm bg-background border border-border px-3 py-2 text-foreground " +
  "placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors";

const PHASE_SUGGESTIONS = [
  "Pre-Production",
  "Filming",
  "Editing",
  "Colour Grade",
  "Sound Design",
  "Sound Mix",
  "VFX",
  "Review",
  "Delivery",
];

export function NewPhaseForm({ projectId }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const {
    cancelDictation,
    isFinalizing,
    isLiveFormatting,
    isRecording,
    toggleDictation,
  } = useLiveDictation({
    value: notes,
    onChange: setNotes,
    contextType: "phase-notes",
    minLiveIntervalMs: 800,
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("notes", notes);
    setError(null);

    startTransition(async () => {
      try {
        await createPhaseAction(fd);
        setOpen(false);
        setNotes("");
        (e.target as HTMLFormElement).reset();
        toast.success("Phase added");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          cancelDictation();
          setNotes("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <button className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
          <Plus className="w-3 h-3" />
          Add Phase
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">New Phase</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <input type="hidden" name="project_id" value={projectId} />

          <div>
            <label className="label-xs">Phase Name *</label>
            <input
              name="name"
              required
              autoFocus
              placeholder="Filming, Editing, Colour Grade…"
              list="phase-suggestions"
              className={fieldClass}
            />
            <datalist id="phase-suggestions">
              {PHASE_SUGGESTIONS.map(s => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="label-xs">Status</label>
            <select name="status" defaultValue="upcoming" className={fieldClass}>
              <option value="upcoming">Upcoming</option>
              <option value="active">Active</option>
              <option value="complete">Complete</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-xs">Start Date *</label>
              <input name="start_date" type="date" required className={fieldClass} />
            </div>
            <div>
              <label className="label-xs">End Date</label>
              <input name="end_date" type="date" className={fieldClass} />
              <p className="text-[10px] text-muted-foreground/50 mt-1">Leave blank if ongoing</p>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="label-xs mb-0">Notes</label>
              <div className="flex items-center gap-2">
                {(isLiveFormatting || isFinalizing) && (
                  <span className="text-[10px] text-muted-foreground/60">
                    {isFinalizing ? "Final polish…" : "Tidying…"}
                  </span>
                )}
                <button
                  type="button"
                  onClick={toggleDictation}
                  disabled={isFinalizing}
                  className={cn(
                    "flex items-center gap-1 text-[10px] px-2 py-0.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                    isRecording
                      ? "border-red-400/60 text-red-400 bg-red-400/5"
                      : "border-border/40 text-muted-foreground/50 hover:text-foreground"
                  )}
                >
                  {isRecording ? <MicOff className="w-2.5 h-2.5" /> : <Mic className="w-2.5 h-2.5" />}
                  {isRecording ? "Stop" : "Dictate"}
                  {isRecording && <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />}
                  {!isRecording && (isLiveFormatting || isFinalizing) && (
                    <Wand2 className="w-2.5 h-2.5" />
                  )}
                </button>
              </div>
            </div>
            <textarea
              name="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              readOnly={isRecording || isFinalizing}
              rows={2}
              placeholder="Any notes about this phase…"
              className={cn(
                fieldClass,
                "resize-none",
                (isRecording || isFinalizing) && "cursor-not-allowed text-foreground/80"
              )}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className="text-xs h-8" disabled={isPending || isFinalizing}>
              {isPending ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Adding…
                </>
              ) : (
                "Add Phase"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
