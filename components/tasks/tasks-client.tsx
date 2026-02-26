"use client";

import { useState } from "react";
import Link from "next/link";
import { List, Columns3 } from "lucide-react";
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

type ViewMode = "list" | "board";

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

const PRIORITY_FILTERS = ["all", "high", "medium", "low"] as const;

export function TasksClient({ tasks, projects }: Props) {
  const [view, setView] = useState<ViewMode>("list");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  function setViewMode(mode: ViewMode) {
    setView(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("prdcr-tasks-view", mode);
    }
  }

  // Apply filters
  let filtered = tasks;
  if (priorityFilter !== "all") {
    filtered = filtered.filter((t) => t.priority === priorityFilter);
  }
  if (projectFilter !== "all") {
    filtered = filtered.filter((t) => t.project_id === projectFilter);
  }

  const open = filtered
    .filter((t) => !t.completed)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const done = filtered.filter((t) => t.completed);

  const totalOpen = tasks.filter((t) => !t.completed).length;
  const totalDone = tasks.filter((t) => t.completed).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-8 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Tasks
          </h1>
          <span className="text-xs text-muted-foreground/50">
            {totalOpen} open &middot; {totalDone} done
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center gap-0 border border-border">
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 transition-colors",
                view === "list"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground/40 hover:text-foreground"
              )}
              title="List view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("board")}
              className={cn(
                "p-1.5 transition-colors",
                view === "board"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground/40 hover:text-foreground"
              )}
              title="Board view"
            >
              <Columns3 className="w-3.5 h-3.5" />
            </button>
          </div>
          <NewTaskForm projects={projects} />
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-4 px-8 py-2.5 border-b border-border/50 shrink-0">
        {/* Priority chips */}
        <div className="flex items-center gap-1.5">
          {PRIORITY_FILTERS.map((p) => {
            const label = p === "all" ? "All" : p.charAt(0).toUpperCase() + p.slice(1);
            const active = priorityFilter === p;
            return (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={cn(
                  "text-[11px] px-2.5 py-1 font-medium transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground/50 hover:text-foreground hover:bg-accent/40"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Project dropdown */}
        {projects.length > 0 && (
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="text-[11px] bg-transparent border border-border px-2 py-1 text-muted-foreground focus:outline-none focus:border-primary transition-colors cursor-pointer"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.client ? `${p.client} — ${p.title}` : p.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Content */}
      {view === "list" ? (
        <ListView open={open} done={done} />
      ) : (
        <BoardView open={open} done={done} />
      )}
    </div>
  );
}

/* ── List View ───────────────────────────────────────────── */
function ListView({ open, done }: { open: TaskWithProject[]; done: TaskWithProject[] }) {
  const todayTasks = open.filter((t) => t.due_date && formatDate(t.due_date) === "Today");
  const upcomingTasks = open.filter((t) => !t.due_date || formatDate(t.due_date) !== "Today");

  return (
    <div className="flex-1 overflow-auto px-8 py-8 max-w-3xl">
      {todayTasks.length > 0 && (
        <section className="mb-10">
          <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/50 mb-4">
            Today
          </p>
          <TaskTable tasks={todayTasks} />
        </section>
      )}

      {upcomingTasks.length > 0 && (
        <section className="mb-10">
          <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/50 mb-4">
            Upcoming
          </p>
          <TaskTable tasks={upcomingTasks} />
        </section>
      )}

      {done.length > 0 && (
        <section>
          <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/50 mb-4">
            Completed
          </p>
          <div className="border border-border/40 opacity-50">
            {done.map((task, i) => (
              <div
                key={task.id}
                data-task-row
                className={cn(
                  "flex items-center gap-4 px-4 py-3 group",
                  i !== 0 && "border-t border-border/40"
                )}
              >
                <TaskCheckbox taskId={task.id} completed={task.completed} />
                <p className="flex-1 text-sm text-muted-foreground line-through">{task.title}</p>
                {task.projects && (
                  <span className="text-xs text-muted-foreground">
                    {task.projects.client ?? task.projects.title}
                  </span>
                )}
                <DeleteTaskButton taskId={task.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      {open.length === 0 && done.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-muted-foreground">No tasks yet. Add your first one.</p>
        </div>
      )}
    </div>
  );
}

function TaskTable({ tasks }: { tasks: TaskWithProject[] }) {
  return (
    <div className="border border-border">
      {tasks.map((task, i) => {
        const overdue = task.due_date && isOverdue(task.due_date);

        return (
          <div
            key={task.id}
            data-task-row
            className={cn(
              "flex items-center gap-4 px-4 py-3.5 group hover:bg-accent/20 transition-colors",
              i !== 0 && "border-t border-border/60"
            )}
          >
            <TaskCheckbox taskId={task.id} completed={task.completed} />

            {task.priority === "high" && (
              <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
            )}

            <p className="flex-1 text-sm text-foreground">{task.title}</p>

            {task.projects && (
              <Link href={`/dashboard/projects/${task.projects.id}`}>
                <span
                  className="text-[11px] font-medium px-2 py-0.5 border transition-colors hover:opacity-80"
                  style={{
                    borderColor: `${task.projects.color}40`,
                    color: task.projects.color,
                    backgroundColor: `${task.projects.color}10`,
                  }}
                >
                  {task.projects.client ?? task.projects.title}
                </span>
              </Link>
            )}

            {task.due_date && (
              <span className={cn(
                "text-xs tabular-nums shrink-0 w-20 text-right",
                overdue ? "text-destructive font-medium" : "text-muted-foreground"
              )}>
                {formatDate(task.due_date)}
              </span>
            )}

            <DeleteTaskButton taskId={task.id} />
          </div>
        );
      })}
    </div>
  );
}

/* ── Board View (Kanban) ─────────────────────────────────── */
const BOARD_COLUMNS = [
  { key: "todo", label: "To Do", filter: (t: TaskWithProject) => !t.completed && t.priority !== "high" },
  { key: "priority", label: "High Priority", filter: (t: TaskWithProject) => !t.completed && t.priority === "high" },
  { key: "done", label: "Done", filter: (t: TaskWithProject) => t.completed },
] as const;

function BoardView({ open, done }: { open: TaskWithProject[]; done: TaskWithProject[] }) {
  const all = [...open, ...done];
  const columns = BOARD_COLUMNS.map((col) => ({
    ...col,
    tasks: all.filter(col.filter),
  }));

  return (
    <div className="flex-1 overflow-auto px-6 py-6">
      <div className="flex gap-4 min-h-[calc(100vh-8rem)]">
        {columns.map((col) => (
          <div key={col.key} className="flex-1 min-w-[250px]">
            <div className="flex items-center gap-2 mb-4">
              <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/50">
                {col.label}
              </p>
              <span className="text-[10px] text-muted-foreground/30 font-semibold">
                {col.tasks.length}
              </span>
            </div>

            <div className="space-y-2">
              {col.tasks.map((task) => {
                const overdue = task.due_date && isOverdue(task.due_date);
                return (
                  <div
                    key={task.id}
                    data-task-row
                    className={cn(
                      "border border-border p-3.5 hover:shadow-sm transition-shadow group",
                      task.completed && "opacity-40"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <TaskCheckbox taskId={task.id} completed={task.completed} />
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm text-foreground leading-snug",
                          task.completed && "line-through text-muted-foreground"
                        )}>
                          {task.title}
                        </p>

                        <div className="flex items-center gap-2 mt-2">
                          {task.priority === "high" && !task.completed && (
                            <span className="text-[10px] font-semibold text-destructive uppercase tracking-wider">
                              High
                            </span>
                          )}
                          {task.projects && (
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5"
                              style={{
                                color: task.projects.color,
                                backgroundColor: `${task.projects.color}15`,
                              }}
                            >
                              {task.projects.client ?? task.projects.title}
                            </span>
                          )}
                          {task.due_date && (
                            <span className={cn(
                              "text-[10px] tabular-nums",
                              overdue ? "text-destructive font-medium" : "text-muted-foreground"
                            )}>
                              {formatDate(task.due_date)}
                            </span>
                          )}
                        </div>
                      </div>
                      <DeleteTaskButton taskId={task.id} />
                    </div>
                  </div>
                );
              })}

              {col.tasks.length === 0 && (
                <div className="border border-dashed border-border/40 py-8 text-center">
                  <p className="text-xs text-muted-foreground/40">No tasks</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
