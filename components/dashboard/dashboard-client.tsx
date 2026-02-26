"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { STATUS_CONFIG } from "@/lib/mock-data";
import { shortDate, formatDate, formatGreetingDate } from "@/lib/dates";
import { TaskCheckbox } from "@/components/tasks/task-checkbox";
import type { Project } from "@/lib/db/projects";
import type { TaskWithProject } from "@/lib/db/tasks";

/* ── Animation primitives ──────────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const staggerLate = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
};

const spring = { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const };

interface Props {
  projects: Project[];
  tasks: TaskWithProject[];
}

export function DashboardClient({ projects, tasks }: Props) {
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLabel = formatGreetingDate();

  /* ── Derived data ──────────────────────────────────────── */
  const openTasks = tasks.filter((t) => !t.completed);
  const highPriority = openTasks.filter((t) => t.priority === "high");

  const pendingDrafts = projects.flatMap((p) =>
    (p.edit_versions ?? []).filter((v) => v.status === "draft-sent")
  );

  const todayStr = now.toDateString();
  const todayTasks = openTasks.filter(
    (t) => t.due_date && new Date(t.due_date).toDateString() === todayStr
  );
  const upcomingTasks = openTasks
    .filter((t) => t.due_date && new Date(t.due_date) > now)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 5);

  /* ── Stat definitions ──────────────────────────────────── */
  const stats = [
    { label: "Projects", value: projects.length, href: "/dashboard/projects" },
    { label: "Open Tasks", value: openTasks.length, href: "/dashboard/tasks" },
    { label: "High Priority", value: highPriority.length, href: "/dashboard/tasks" },
    { label: "Drafts Pending", value: pendingDrafts.length, href: "/dashboard/projects" },
  ];

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto px-10 py-10">

        {/* ── Greeting — compact ─────────────────────────── */}
        <motion.div
          className="flex items-baseline justify-between mb-8"
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          transition={spring}
        >
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              {greeting}
            </h1>
          </div>
          <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/50">
            {dateLabel}
          </p>
        </motion.div>

        {/* ── Stat strip — horizontal, compact ───────────── */}
        <motion.div
          className="flex items-center gap-0 mb-8 border border-border"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          {stats.map((stat, i) => (
            <motion.div key={stat.label} variants={fadeUp} transition={spring} className="flex-1">
              <Link
                href={stat.href}
                className={cn(
                  "block px-5 py-3.5 hover:bg-accent/20 transition-colors",
                  i !== 0 && "border-l border-border"
                )}
              >
                <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/50 mb-1">
                  {stat.label}
                </p>
                <p className="text-2xl font-black tracking-tight text-foreground leading-none">
                  {stat.value}
                </p>
              </Link>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Today's Tasks — HERO section ────────────────── */}
        <motion.div
          className="mb-8"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.div variants={fadeUp} transition={spring}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/50">
                {todayTasks.length > 0
                  ? `Today\u2019s Tasks (${todayTasks.length})`
                  : "Today\u2019s Tasks"}
              </p>
              <Link
                href="/dashboard/tasks"
                className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-primary transition-colors"
              >
                All Tasks <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </motion.div>

          {todayTasks.length > 0 ? (
            <motion.div variants={stagger} initial="hidden" animate="visible">
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  {todayTasks.map((task, i) => (
                    <motion.div key={task.id} variants={fadeUp} transition={spring}>
                      <div
                        className={cn(
                          "flex items-center gap-4 px-5 py-3.5 hover:bg-accent/20 transition-colors group",
                          i !== 0 && "border-t border-border/40"
                        )}
                      >
                        <TaskCheckbox taskId={task.id} completed={task.completed} />

                        {task.priority === "high" && (
                          <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                        )}

                        <p className="flex-1 text-sm font-medium text-foreground truncate">
                          {task.title}
                        </p>

                        {task.projects && (
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 shrink-0"
                            style={{
                              color: task.projects.color,
                              backgroundColor: `${task.projects.color}15`,
                            }}
                          >
                            {task.projects.client ?? task.projects.title}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div variants={fadeUp} transition={spring}>
              <Card>
                <CardContent className="py-10 text-center">
                  <CheckCircle2 className="w-8 h-8 text-primary/40 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-foreground mb-1">
                    All clear for today
                  </p>
                  {upcomingTasks.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Next up: <span className="font-medium text-foreground/80">{upcomingTasks[0].title}</span>
                      {upcomingTasks[0].due_date && (
                        <span className="text-muted-foreground/60"> · {formatDate(upcomingTasks[0].due_date)}</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">No upcoming tasks</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </motion.div>

        {/* ── Lower panels ───────────────────────────────── */}
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
          initial="hidden"
          animate="visible"
          variants={staggerLate}
        >
          {/* Active projects */}
          <motion.div variants={fadeUp} transition={spring}>
            <Card className="overflow-hidden h-full">
              <CardContent className="p-0">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40">
                  <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/55">
                    Active Projects
                  </p>
                  <Link
                    href="/dashboard/projects"
                    className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                  >
                    All <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </div>

                {projects.slice(0, 5).map((project, i) => {
                  const status = STATUS_CONFIG[project.status];
                  return (
                    <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
                      <div
                        className={cn(
                          "flex items-center gap-3.5 px-5 py-3.5 hover:bg-accent/20 transition-colors group",
                          i !== 0 && "border-t border-border/30"
                        )}
                      >
                        <div
                          className="w-1.5 h-8 rounded-sm shrink-0"
                          style={{ backgroundColor: project.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                            {project.title}
                          </p>
                          {project.client && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {project.client}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          {project.due_date && (
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              {shortDate(project.due_date)}
                            </span>
                          )}
                          {status && (
                            <span className={cn("status-pill text-[10px]", status.bg, status.color)}>
                              <span className={cn("w-1.5 h-1.5 rounded-full", status.dot)} />
                              {status.label}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}

                {projects.length === 0 && (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm text-muted-foreground">No projects yet.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Upcoming tasks */}
          <motion.div variants={fadeUp} transition={spring}>
            <Card className="overflow-hidden h-full">
              <CardContent className="p-0">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40">
                  <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground/55">
                    Upcoming Tasks
                  </p>
                  <Link
                    href="/dashboard/tasks"
                    className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                  >
                    All <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </div>

                {upcomingTasks.map((task, i) => (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-center gap-3.5 px-5 py-3.5 hover:bg-accent/20 transition-colors",
                      i !== 0 && "border-t border-border/30"
                    )}
                  >
                    <TaskCheckbox taskId={task.id} completed={task.completed} />

                    <p className="flex-1 text-sm text-foreground truncate">
                      {task.title}
                    </p>

                    <div className="flex items-center gap-2 shrink-0">
                      {task.priority === "high" && (
                        <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
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
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {formatDate(task.due_date)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {upcomingTasks.length === 0 && (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      No upcoming tasks.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
