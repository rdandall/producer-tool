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
import { Plus } from "lucide-react";

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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);

    startTransition(async () => {
      try {
        await createPhaseAction(fd);
        setOpen(false);
        (e.target as HTMLFormElement).reset();
        toast.success("Phase added");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            <label className="label-xs">Notes</label>
            <textarea
              name="notes"
              rows={2}
              placeholder="Any notes about this phase…"
              className={`${fieldClass} resize-none`}
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
            <Button type="submit" size="sm" className="text-xs h-8" disabled={isPending}>
              {isPending ? "Adding…" : "Add Phase"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
