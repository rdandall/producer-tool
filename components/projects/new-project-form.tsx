"use client";

import { useState, useTransition } from "react";
import { createProjectAction } from "@/app/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { BriefField } from "./brief-field";

const COLORS = [
  "#f59e0b", "#8b5cf6", "#3b82f6", "#10b981",
  "#ef4444", "#f97316", "#ec4899", "#6366f1",
];

const STATUS_OPTIONS = [
  { value: "idea",           label: "Idea" },
  { value: "pre-production", label: "Pre-Production" },
  { value: "filming",        label: "Filming" },
  { value: "editing",        label: "Editing" },
  { value: "review",         label: "In Review" },
  { value: "delivered",      label: "Delivered" },
];

const fieldClass =
  "w-full text-sm bg-background border border-border px-3 py-2 text-foreground " +
  "placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors";

export function NewProjectForm() {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(COLORS[2]);
  const [brief, setBrief] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isOngoing, setIsOngoing] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("color", color);
    setError(null);

    startTransition(async () => {
      try {
        await createProjectAction(fd);
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 text-xs h-8">
          <Plus className="w-3.5 h-3.5" />
          New Project
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">New Project</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Title + Client */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label-xs">Project Title *</label>
              <input name="title" required placeholder="Brand Film" className={fieldClass} />
            </div>
            <div>
              <label className="label-xs">Client</label>
              <input name="client" placeholder="Nike" className={fieldClass} />
            </div>
            <div>
              <label className="label-xs">Status</label>
              <select name="status" defaultValue="idea" className={fieldClass}>
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Due date + Ongoing toggle */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label-xs" style={{ marginBottom: 0 }}>Due Date</label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  name="ongoing"
                  checked={isOngoing}
                  onChange={e => setIsOngoing(e.target.checked)}
                  className="w-3 h-3 accent-primary"
                />
                <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/60">
                  Ongoing
                </span>
              </label>
            </div>
            {isOngoing ? (
              <p className="text-xs text-muted-foreground/50 italic py-2 px-3 border border-border/40 border-dashed">
                No end date — this project runs open-ended
              </p>
            ) : (
              <input name="due_date" type="date" className={fieldClass} />
            )}
          </div>

          {/* Brief — with voice + AI */}
          <div>
            <label className="label-xs">Brief</label>
            <input type="hidden" name="brief" value={brief} />
            <BriefField
              value={brief}
              onChange={setBrief}
              placeholder="What's this project about? Type or hit the mic to talk through it…"
              rows={3}
              disabled={isPending}
            />
          </div>

          {/* Frame.io */}
          <div>
            <label className="label-xs">Frame.io Link</label>
            <input name="frameio_link" placeholder="https://app.frame.io/..." className={fieldClass} />
          </div>

          {/* Editor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-xs">Editor Name</label>
              <input name="editor_name" placeholder="James Okafor" className={fieldClass} />
            </div>
            <div>
              <label className="label-xs">Editor Email</label>
              <input name="editor_email" type="email" placeholder="james@..." className={fieldClass} />
            </div>
          </div>

          {/* Client email */}
          <div>
            <label className="label-xs">Client Email</label>
            <input name="client_email" type="email" placeholder="client@..." className={fieldClass} />
          </div>

          {/* Colour */}
          <div>
            <label className="label-xs">Colour</label>
            <div className="flex gap-2 mt-1.5">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "w-6 h-6 rounded-full transition-transform",
                    color === c && "ring-2 ring-offset-2 ring-foreground/30 scale-110"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" className="text-xs h-8" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="text-xs h-8" disabled={isPending}>
              {isPending ? "Creating…" : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
