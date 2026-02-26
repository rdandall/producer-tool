"use client";

import { useRef, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { deleteTaskAction } from "@/app/actions";
import { cn } from "@/lib/utils";

interface Props {
  taskId: string;
  className?: string;
}

export function DeleteTaskButton({ taskId, className }: Props) {
  const [isPending, startTransition] = useTransition();
  const btnRef = useRef<HTMLButtonElement>(null);

  /** Find the closest task-row ancestor to show/hide */
  function getRow() {
    return btnRef.current?.closest("[data-task-row]") as HTMLElement | null;
  }

  function handleDelete() {
    const row = getRow();

    // Optimistically collapse the row
    if (row) {
      row.style.overflow = "hidden";
      row.style.maxHeight = row.scrollHeight + "px";
      row.style.transition = "max-height 200ms ease, opacity 200ms ease";
      requestAnimationFrame(() => {
        row.style.maxHeight = "0";
        row.style.opacity = "0";
      });
    }

    toast("Task deleted", {
      duration: 4000,
      action: {
        label: "Undo",
        onClick: () => {
          // Restore the row
          if (row) {
            row.style.maxHeight = "";
            row.style.opacity = "";
            row.style.overflow = "";
            row.style.transition = "";
          }
        },
      },
      onAutoClose: () => {
        startTransition(() => deleteTaskAction(taskId));
      },
      onDismiss: () => {
        startTransition(() => deleteTaskAction(taskId));
      },
    });
  }

  return (
    <button
      ref={btnRef}
      onClick={handleDelete}
      disabled={isPending}
      title="Delete task"
      className={cn(
        "opacity-0 group-hover:opacity-100 transition-opacity",
        "text-muted-foreground/40 hover:text-destructive",
        "disabled:opacity-30",
        className
      )}
    >
      <X className="w-3.5 h-3.5" />
    </button>
  );
}
