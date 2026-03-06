"use client";

import { CheckCircle2, X, ListChecks } from "lucide-react";
import type { EmailTaskSuggestion } from "@/lib/db/emails";

interface Project {
  id: string;
  title: string;
}

interface TaskSuggestionQueueProps {
  suggestions: EmailTaskSuggestion[];
  projects: Project[];
  onApprove: (suggestion: EmailTaskSuggestion) => void;
  onDismiss: (id: string) => void;
}

const PRIORITY_STYLES: Record<string, string> = {
  high: "text-red-400 bg-red-400/10",
  medium: "text-amber-400 bg-amber-400/10",
  low: "text-muted-foreground bg-muted/50",
};

export function TaskSuggestionQueue({
  suggestions,
  projects,
  onApprove,
  onDismiss,
}: TaskSuggestionQueueProps) {
  if (!suggestions.length) return null;

  return (
    <div className="border-t border-border">
      <div className="px-3 py-2 flex items-center gap-2">
        <ListChecks className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="text-xs font-medium text-amber-400">
          {suggestions.length} task{suggestions.length !== 1 ? "s" : ""} to review
        </span>
      </div>

      <div className="max-h-48 overflow-y-auto">
        {suggestions.map((s) => {
          const project = projects.find((p) => p.id === s.project_id);
          return (
            <div
              key={s.id}
              className="px-3 py-2 border-t border-border/50 group hover:bg-sidebar-accent/50 transition-colors"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground leading-snug line-clamp-2">
                    {s.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 font-medium ${PRIORITY_STYLES[s.priority] ?? PRIORITY_STYLES.medium}`}
                    >
                      {s.priority}
                    </span>
                    {project && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        {project.title}
                      </span>
                    )}
                    {s.due_hint && (
                      <span className="text-[10px] text-muted-foreground">
                        · {s.due_hint}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onApprove(s)}
                    className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-green-400 transition-colors"
                    title="Add to tasks"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDismiss(s.id)}
                    className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    title="Dismiss"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
