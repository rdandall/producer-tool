"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTaskAction } from "@/app/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Plus, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveDictation } from "@/hooks/use-live-dictation";

interface Project {
  id: string;
  title: string;
  client: string | null;
}

interface Props {
  projects: Project[];
  defaultProjectId?: string;
}

const fieldClass =
  "w-full text-sm bg-background border border-border px-3 py-2 text-foreground " +
  "placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors";

export function NewTaskForm({ projects, defaultProjectId }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  const {
    cancelDictation,
    isFinalizing,
    isLiveFormatting,
    isRecording,
    toggleDictation,
  } = useLiveDictation({
    value: title,
    onChange: setTitle,
    contextType: "task-title",
    minLiveIntervalMs: 700,
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);

    startTransition(async () => {
      try {
        await createTaskAction(fd);
        setOpen(false);
        setTitle("");
        (e.target as HTMLFormElement).reset();
        toast.success("Task added");
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
          setTitle("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 text-xs h-8">
          <Plus className="w-3.5 h-3.5" />
          Add Task
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">New Task</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="label-xs mb-0">Task *</label>
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
            <input
              name="title"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              readOnly={isRecording || isFinalizing}
              placeholder="What needs doing?"
              className={cn(
                fieldClass,
                (isRecording || isFinalizing) && "cursor-not-allowed text-foreground/80"
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-xs">Project</label>
              <select
                name="project_id"
                defaultValue={defaultProjectId || ""}
                className={fieldClass}
              >
                <option value="">— None —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.client ? `${p.client} — ${p.title}` : p.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-xs">Priority</label>
              <select name="priority" defaultValue="medium" className={fieldClass}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label-xs">Due Date</label>
            <input name="due_date" type="date" className={fieldClass} />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" className="text-xs h-8" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="text-xs h-8" disabled={isPending}>
              {isPending ? "Adding…" : "Add Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
