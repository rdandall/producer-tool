"use client";

import { useTransition } from "react";
import { toggleTaskAction } from "@/app/actions";
import { cn } from "@/lib/utils";

interface Props {
  taskId: string;
  completed: boolean;
}

export function TaskCheckbox({ taskId, completed }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(() => toggleTaskAction(taskId, !completed))
      }
      disabled={isPending}
      aria-label={completed ? "Mark incomplete" : "Mark complete"}
      className={cn(
        "w-4 h-4 border shrink-0 flex items-center justify-center transition-colors cursor-pointer",
        completed
          ? "bg-primary/10 border-primary/50"
          : "border-border hover:border-primary",
        isPending && "opacity-40"
      )}
    >
      {completed && (
        <svg className="w-2.5 h-2.5 text-primary" viewBox="0 0 10 10" fill="none">
          <path
            d="M1.5 5L4 7.5L8.5 2.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
