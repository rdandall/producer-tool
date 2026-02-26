"use client";

import { useTransition } from "react";
import { updatePhaseStatusAction, deletePhaseAction } from "@/app/actions";
import { cn } from "@/lib/utils";
import { shortDate } from "@/lib/dates";
import type { Phase, PhaseStatus } from "@/lib/db/projects";
import { X } from "lucide-react";

const STATUS_CYCLE: Record<PhaseStatus, PhaseStatus> = {
  upcoming: "active",
  active: "complete",
  complete: "upcoming",
};

const STATUS_STYLE: Record<PhaseStatus, { pill: string; dot: string; label: string }> = {
  upcoming: {
    pill: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
    label: "Upcoming",
  },
  active: {
    pill: "bg-primary/10 text-primary",
    dot: "bg-primary animate-pulse",
    label: "Active",
  },
  complete: {
    pill: "bg-muted-foreground/10 text-muted-foreground",
    dot: "bg-muted-foreground/50",
    label: "Complete",
  },
};

interface Props {
  phase: Phase;
  isLast: boolean;
}

export function PhaseRow({ phase, isLast }: Props) {
  const [isPending, startTransition] = useTransition();
  const style = STATUS_STYLE[phase.status];

  function cycleStatus() {
    const next = STATUS_CYCLE[phase.status];
    startTransition(() => updatePhaseStatusAction(phase.id, next));
  }

  function handleDelete() {
    startTransition(() => deletePhaseAction(phase.id));
  }

  return (
    <div
      className={cn(
        "flex items-start gap-4 px-5 py-3.5 group transition-colors",
        phase.status === "active" && "bg-primary/[0.04]",
        !isLast && "border-b border-border/50"
      )}
      style={{ opacity: isPending ? 0.5 : 1 }}
    >
      {/* Status pill — click to cycle */}
      <button
        onClick={cycleStatus}
        disabled={isPending}
        title="Click to change status"
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider shrink-0 mt-0.5 transition-opacity hover:opacity-70",
          style.pill
        )}
      >
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", style.dot)} />
        {style.label}
      </button>

      {/* Name + dates */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-semibold text-foreground leading-snug",
          phase.status === "complete" && "line-through text-muted-foreground"
        )}>
          {phase.name}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {shortDate(phase.start_date)}
          {" → "}
          {phase.end_date ? shortDate(phase.end_date) : (
            <span className="text-primary/70">ongoing</span>
          )}
        </p>
        {phase.notes && (
          <p className="text-[11px] text-muted-foreground/70 mt-1 leading-relaxed">
            {phase.notes}
          </p>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/40 hover:text-destructive shrink-0 mt-0.5"
        title="Delete phase"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
