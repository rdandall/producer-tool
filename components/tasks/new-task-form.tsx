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
import { Plus } from "lucide-react";

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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);

    startTransition(async () => {
      try {
        await createTaskAction(fd);
        setOpen(false);
        (e.target as HTMLFormElement).reset();
        toast.success("Task added");
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
          Add Task
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">New Task</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <label className="label-xs">Task *</label>
            <input
              name="title"
              required
              autoFocus
              placeholder="What needs doing?"
              className={fieldClass}
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
