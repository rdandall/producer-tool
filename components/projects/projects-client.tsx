"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowUpRight, LayoutGrid, List } from "lucide-react";
import { STATUS_CONFIG } from "@/lib/mock-data";
import { daysUntil } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { NewProjectForm } from "@/components/projects/new-project-form";
import type { Project } from "@/lib/db/projects";

interface Props {
  projects: Project[];
}

type ViewMode = "table" | "grid";

function currentEditLabel(project: Project) {
  const versions = project.edit_versions ?? [];
  if (!versions.length) return "\u2014";
  const latest = versions[versions.length - 1];
  const statusMap: Record<string, string> = {
    approved: "Approved",
    "changes-requested": "Changes req.",
    "draft-sent": "Draft sent",
    "in-progress": "In progress",
    "not-started": "Not started",
  };
  return `${latest.label.toUpperCase()} \u00B7 ${statusMap[latest.status] ?? latest.status}`;
}

const STATUS_FILTERS = [
  "all", "idea", "pre-production", "filming", "editing", "review", "delivered",
] as const;

export function ProjectsClient({ projects }: Props) {
  const [view, setView] = useState<ViewMode>("table");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Persist preference
  useEffect(() => {
    const saved = localStorage.getItem("prdcr-projects-view") as ViewMode | null;
    if (saved) setView(saved);
  }, []);

  function setViewMode(mode: ViewMode) {
    setView(mode);
    localStorage.setItem("prdcr-projects-view", mode);
  }

  const filtered = statusFilter === "all"
    ? projects
    : projects.filter((p) => p.status === statusFilter);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between px-8 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Projects
          </h1>
          <span className="text-xs text-muted-foreground/50">
            {filtered.length}{statusFilter !== "all" ? ` of ${projects.length}` : ""} active
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center gap-0 border border-border">
            <button
              onClick={() => setViewMode("table")}
              className={cn(
                "p-1.5 transition-colors",
                view === "table"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground/40 hover:text-foreground"
              )}
              title="Table view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 transition-colors",
                view === "grid"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground/40 hover:text-foreground"
              )}
              title="Grid view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
          <NewProjectForm />
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 px-8 py-2.5 border-b border-border/50 shrink-0">
        {STATUS_FILTERS.map((s) => {
          const label = s === "all" ? "All" : (STATUS_CONFIG[s]?.label ?? s);
          const active = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
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

      {/* Content */}
      {view === "table" ? (
        <TableView projects={filtered} />
      ) : (
        <GridView projects={filtered} />
      )}
    </div>
  );
}

/* ── Table View ──────────────────────────────────────────── */
function TableView({ projects }: { projects: Project[] }) {
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-8 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 w-[220px]">
              Client
            </th>
            <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
              Project
            </th>
            <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 w-[140px]">
              Status
            </th>
            <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 w-[200px]">
              Edit
            </th>
            <th className="text-right px-8 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60 w-[100px]">
              Due
            </th>
          </tr>
        </thead>

        <tbody>
          {projects.map((project) => {
            const status = STATUS_CONFIG[project.status];
            const edit = currentEditLabel(project);
            const openTasks = (project.tasks ?? []).filter((t) => !t.completed).length;
            const due = project.due_date ? daysUntil(project.due_date) : null;

            return (
              <tr
                key={project.id}
                className="group border-b border-border/50 hover:bg-accent/30 transition-colors cursor-pointer"
              >
                <td className="px-8 py-4">
                  <Link href={`/dashboard/projects/${project.id}`} className="flex items-center gap-3">
                    <div className="w-1.5 h-8 rounded-sm shrink-0" style={{ backgroundColor: project.color }} />
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                        {project.client ?? "\u2014"}
                      </p>
                      <p className="text-xs text-muted-foreground/40 mt-0.5">
                        {openTasks} open task{openTasks !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </Link>
                </td>

                <td className="px-4 py-4">
                  <Link href={`/dashboard/projects/${project.id}`} className="flex items-center gap-2 group/link">
                    <span className="text-[15px] font-semibold text-foreground group-hover/link:text-primary transition-colors">
                      {project.title}
                    </span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/30 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                  </Link>
                  {project.brief && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 max-w-md">
                      {project.brief}
                    </p>
                  )}
                </td>

                <td className="px-4 py-4">
                  {status && (
                    <span className={cn("status-pill", status.bg, status.color)}>
                      <span className={cn("w-1.5 h-1.5 rounded-full", status.dot)} />
                      {status.label}
                    </span>
                  )}
                </td>

                <td className="px-4 py-4">
                  <span className="text-muted-foreground font-mono text-xs">
                    {edit}
                  </span>
                </td>

                <td className="px-8 py-4 text-right">
                  {due ? (
                    <span className={cn(
                      "text-sm font-medium tabular-nums",
                      due.overdue ? "text-destructive" : "text-muted-foreground"
                    )}>
                      {due.label}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground/30">{"\u2014"}</span>
                  )}
                </td>
              </tr>
            );
          })}

          {projects.length === 0 && (
            <tr>
              <td colSpan={5} className="px-8 py-16 text-center text-sm text-muted-foreground">
                No projects yet. Create your first one.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ── Grid View ───────────────────────────────────────────── */
function GridView({ projects }: { projects: Project[] }) {
  return (
    <div className="flex-1 overflow-auto px-8 py-6">
      {projects.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-muted-foreground">No projects yet. Create your first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => {
            const status = STATUS_CONFIG[project.status];
            const openTasks = (project.tasks ?? []).filter((t) => !t.completed).length;
            const due = project.due_date ? daysUntil(project.due_date) : null;

            return (
              <Link
                key={project.id}
                href={`/dashboard/projects/${project.id}`}
                className="group block border border-border hover:border-border/80 hover:shadow-md transition-all"
              >
                {/* Color accent bar */}
                <div className="h-1" style={{ backgroundColor: project.color }} />

                <div className="p-5">
                  {/* Client + Status */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                      {project.client ?? "Personal"}
                    </p>
                    {status && (
                      <span className={cn("status-pill text-[10px] shrink-0", status.bg, status.color)}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", status.dot)} />
                        {status.label}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="text-base font-bold text-foreground leading-snug mb-2 group-hover:text-primary transition-colors">
                    {project.title}
                  </h3>

                  {/* Brief preview */}
                  {project.brief && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-4 leading-relaxed">
                      {project.brief}
                    </p>
                  )}

                  {/* Bottom row */}
                  <div className="flex items-center justify-between pt-3 border-t border-border/40">
                    <span className="text-[11px] text-muted-foreground">
                      {openTasks} task{openTasks !== 1 ? "s" : ""}
                    </span>
                    {due && (
                      <span className={cn(
                        "text-[11px] font-medium tabular-nums",
                        due.overdue ? "text-destructive" : "text-muted-foreground"
                      )}>
                        {due.label}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
