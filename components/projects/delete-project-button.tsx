"use client";

import { useState, useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { deleteProjectAction } from "@/app/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  projectId: string;
  projectTitle: string;
}

export function DeleteProjectButton({ projectId, projectTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteProjectAction(projectId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
        setOpen(false);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-destructive transition-colors"
        title="Delete project"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Delete project?</DialogTitle>
          </DialogHeader>

          <div className="mt-1 mb-4 space-y-2">
            <p className="text-sm text-foreground">
              <span className="font-semibold">{projectTitle}</span> will be permanently deleted.
            </p>
            <p className="text-xs text-muted-foreground">
              This removes all phases, edit versions, and tasks linked to this project. This cannot be undone.
            </p>
          </div>

          {error && <p className="text-xs text-destructive mb-3">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="text-xs h-8 gap-1.5"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Deleting…</>
              ) : (
                <><Trash2 className="w-3 h-3" /> Delete project</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
