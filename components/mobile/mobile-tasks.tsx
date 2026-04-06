"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ChevronDown, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TaskCheckbox } from "@/components/tasks/task-checkbox";
import { DeleteTaskButton } from "@/components/tasks/delete-task-button";
import { NewTaskForm } from "@/components/tasks/new-task-form";
import { cn } from "@/lib/utils";
import { formatDate, isOverdue } from "@/lib/dates";
import type { TaskWithProject } from "@/lib/db/tasks";

interface Project {
  id: string;
  title: string;
  client: string | null;
}

interface Props {
  tasks: TaskWithProject[];
  projects: Project[];
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_DOT: Record<string, string> = {
  high: "bg-destructive",
  medium: "bg-amber-400",
  low: "bg-border/60",
};

export function MobileTasks({ tasks, projects }: Props) {
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskWithProject | null>(null);

  let filtered = tasks;
  if (priorityFilter !== "all") {
    filtered = filtered.filter((t) => t.priority === priorityFilter);
  }

  const open = filtered
    .filter((t) => !t.completed)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const done = filtered.filter((t) => t.completed);

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="shrink-0 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-black tracking-tight">Tasks</h1>
          <Button
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => setShowNewForm(true)}
          >
            <Plus className="w-3.5 h-3.5" /> New
          </Button>
        </div>

        {/* Priority filter pills */}
        <div className="flex gap-1.5">
          {["all", "high", "medium", "low"].map((p) => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={cn(
                "px-2.5 py-1 text-[10px] font-medium capitalize transition-colors rounded-full",
                priorityFilter === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── Task list ── */}
      <div className="flex-1 overflow-auto">
        <div className="px-4 py-3">
          {open.length > 0 ? (
            <Card className="overflow-hidden mb-4">
              <CardContent className="p-0">
                {open.map((task, i) => (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3.5 active:bg-accent/20 transition-colors",
                      i !== 0 && "border-t border-border/30"
                    )}
                    onClick={() => setSelectedTask(task)}
                  >
                    <div onClick={(e) => e.stopPropagation()}>
                      <TaskCheckbox taskId={task.id} completed={task.completed} />
                    </div>
                    <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", PRIORITY_DOT[task.priority])} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground truncate">{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {task.projects && (
                          <span
                            className="text-[9px] font-medium px-1.5 py-0.5"
                            style={{
                              color: task.projects.color,
                              backgroundColor: `${task.projects.color}15`,
                            }}
                          >
                            {task.projects.client ?? task.projects.title}
                          </span>
                        )}
                        {task.due_date && (
                          <span
                            className={cn(
                              "text-[10px] tabular-nums",
                              isOverdue(task.due_date) ? "text-destructive font-medium" : "text-muted-foreground"
                            )}
                          >
                            {formatDate(task.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <div className="py-12 text-center">
              <p className="text-[13px] text-muted-foreground">No open tasks</p>
            </div>
          )}

          {/* Completed section */}
          {done.length > 0 && (
            <div>
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/50 mb-2"
              >
                <ChevronDown
                  className={cn("w-3 h-3 transition-transform", showCompleted && "rotate-180")}
                />
                Completed ({done.length})
              </button>
              {showCompleted && (
                <Card className="overflow-hidden">
                  <CardContent className="p-0">
                    {done.map((task, i) => (
                      <div
                        key={task.id}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 opacity-50",
                          i !== 0 && "border-t border-border/30"
                        )}
                      >
                        <TaskCheckbox taskId={task.id} completed={task.completed} />
                        <p className="text-[13px] text-foreground line-through truncate">
                          {task.title}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Task detail sheet ── */}
      <AnimatePresence>
        {selectedTask && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-50 flex flex-col bg-background"
          >
            <div className="flex items-center gap-3 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))] border-b border-border/30">
              <button
                onClick={() => setSelectedTask(null)}
                className="w-8 h-8 flex items-center justify-center text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
              <h2 className="text-sm font-semibold flex-1 truncate">{selectedTask.title}</h2>
              <DeleteTaskButton taskId={selectedTask.id} />
            </div>
            <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
              <div>
                <p className="label-xs">Priority</p>
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", PRIORITY_DOT[selectedTask.priority])} />
                  <span className="text-sm capitalize">{selectedTask.priority}</span>
                </div>
              </div>
              {selectedTask.projects && (
                <div>
                  <p className="label-xs">Project</p>
                  <Link
                    href={`/dashboard/projects/${selectedTask.project_id}`}
                    className="text-sm text-primary"
                  >
                    {selectedTask.projects.title}
                  </Link>
                </div>
              )}
              {selectedTask.due_date && (
                <div>
                  <p className="label-xs">Due Date</p>
                  <p className="text-sm">{formatDate(selectedTask.due_date)}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── New task sheet ── */}
      <AnimatePresence>
        {showNewForm && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-50 flex flex-col bg-background"
          >
            <div className="flex items-center gap-3 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))] border-b border-border/30">
              <button
                onClick={() => setShowNewForm(false)}
                className="w-8 h-8 flex items-center justify-center text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
              <h2 className="text-sm font-semibold">New Task</h2>
            </div>
            <div className="flex-1 overflow-auto px-5 py-4">
              <NewTaskForm projects={projects} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
