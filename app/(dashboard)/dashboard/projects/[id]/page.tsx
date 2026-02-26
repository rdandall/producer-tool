import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getProject, getProjects } from "@/lib/db/projects";
import { STATUS_CONFIG, EDIT_STATUS_CONFIG } from "@/lib/mock-data";
import { TaskCheckbox } from "@/components/tasks/task-checkbox";
import { DeleteTaskButton } from "@/components/tasks/delete-task-button";
import { NewTaskForm } from "@/components/tasks/new-task-form";
import { NewPhaseForm } from "@/components/projects/new-phase-form";
import { PhaseRow } from "@/components/projects/phase-row";
import { BriefEditor } from "@/components/projects/brief-editor";
import { DeleteProjectButton } from "@/components/projects/delete-project-button";
import { cn } from "@/lib/utils";
import { shortDate, daysUntil, formatDate } from "@/lib/dates";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, allProjects] = await Promise.all([getProject(id), getProjects()]);
  if (!project) notFound();

  const status = STATUS_CONFIG[project.status];
  const tasks = project.tasks ?? [];
  const editVersions = project.edit_versions ?? [];
  const phases = (project.phases ?? []).sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );
  const openTasks = tasks.filter((t) => !t.completed);
  const doneTasks = tasks.filter((t) => t.completed);
  const latestEdit = editVersions[editVersions.length - 1] ?? null;
  const due = !project.ongoing && project.due_date ? daysUntil(project.due_date) : null;
  const activePhases = phases.filter(p => p.status === "active");

  const stripItems = [
    project.ongoing
      ? {
          label: "Timeline",
          value: activePhases.length > 0
            ? `${activePhases.length} phase${activePhases.length !== 1 ? "s" : ""} active`
            : "No active phases",
          sub: activePhases.length > 0
            ? activePhases.map(p => p.name).join(", ")
            : "Add phases below",
          subColor: "text-muted-foreground",
          href: undefined,
        }
      : {
          label: "Due Date",
          value: project.due_date ? shortDate(project.due_date) : "No date set",
          sub: due ? due.label : "—",
          subColor: due?.overdue ? "text-destructive" : "text-muted-foreground",
          href: undefined,
        },
    {
      label: "Current Edit",
      value: latestEdit ? latestEdit.label.toUpperCase() : "None",
      sub: latestEdit ? EDIT_STATUS_CONFIG[latestEdit.status].label : "—",
      subColor: latestEdit ? EDIT_STATUS_CONFIG[latestEdit.status].color : "text-muted-foreground",
      href: undefined,
    },
    {
      label: "Frame.io",
      value: project.frameio_link ? "Open project" : "No link",
      href: project.frameio_link ?? undefined,
      sub: project.frameio_link ? "Click to open ↗" : "Add one in settings",
      subColor: "text-muted-foreground",
    },
    {
      label: "Tasks",
      value: `${openTasks.length} open`,
      sub: `${doneTasks.length} completed`,
      subColor: "text-muted-foreground",
      href: undefined,
    },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Top nav bar */}
      <div className="flex items-center justify-between px-8 h-14 border-b border-border shrink-0">
        <Link
          href="/dashboard/projects"
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="uppercase tracking-wider font-medium">Projects</span>
        </Link>
        <div className="flex items-center gap-3">
          <DeleteProjectButton projectId={project.id} projectTitle={project.title} />
          <NewTaskForm projects={allProjects} defaultProjectId={project.id} />
        </div>
      </div>

      <div className="flex-1 overflow-auto">

        {/* Editorial header */}
        <div
          className="px-8 pt-10 pb-8 border-b border-border relative overflow-hidden"
        >
          {/* Subtle colour wash */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `linear-gradient(135deg, ${project.color}0c 0%, transparent 60%)`,
            }}
          />
          <div className="relative flex items-start justify-between gap-8">
            <div className="flex items-start gap-4">
              <div
                className="w-1.5 h-10 rounded-sm shrink-0 mt-0.5"
                style={{ backgroundColor: project.color }}
              />
              <div>
                {project.client && (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
                    {project.client}
                  </p>
                )}
                <h1 className="text-4xl font-black tracking-tight text-foreground leading-none">
                  {project.title}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2 shrink-0">
              {project.ongoing && (
                <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 border border-border text-muted-foreground">
                  Ongoing
                </span>
              )}
              {status && (
                <span className={cn("status-pill shrink-0", status.bg, status.color)}>
                  <span className={cn("w-2 h-2 rounded-full", status.dot)} />
                  {status.label}
                </span>
              )}
            </div>
          </div>

          {/* At-a-glance strip */}
          <div className="flex items-stretch gap-0 mt-8 border border-border">
            {stripItems.map((item, i) => (
              <div
                key={item.label}
                className={cn("flex-1 px-6 py-4", i !== 0 && "border-l border-border")}
              >
                <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/60 mb-2">
                  {item.label}
                </p>
                {item.href ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-base font-semibold text-primary hover:underline"
                  >
                    {item.value}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <p className="text-base font-semibold text-foreground">{item.value}</p>
                )}
                <p className={cn("text-xs mt-0.5", item.subColor)}>{item.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Main content — two column */}
        <div className="flex flex-col lg:flex-row flex-1">

          {/* Left column */}
          <div className="flex-1 border-r border-border min-w-0">

            {/* Brief — view/edit with voice + AI on edit */}
            <section className="px-8 py-7 border-b border-border">
              <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/60 mb-4">
                Brief
              </p>
              <BriefEditor projectId={project.id} initialBrief={project.brief} />
            </section>

            {/* Phases */}
            <section className="px-8 py-7 border-b border-border">
              <div className="flex items-center justify-between mb-5">
                <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/60">
                  Phases
                </p>
                <NewPhaseForm projectId={project.id} />
              </div>

              {phases.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No phases yet. Break your project into concurrent stages — filming, editing, colour grade — each with their own timeline.
                </p>
              ) : (
                <div className="border border-border overflow-hidden">
                  {phases.map((phase, i) => (
                    <PhaseRow key={phase.id} phase={phase} isLast={i === phases.length - 1} />
                  ))}
                </div>
              )}
            </section>

            {/* Edit Versions */}
            <section className="px-8 py-7">
              <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/60 mb-5">
                Edit Versions
              </p>

              {editVersions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No versions yet. They&apos;ll appear here when your editor sends drafts.
                </p>
              ) : (
                <div className="space-y-0 border border-border">
                  {editVersions.map((version, i) => {
                    const editStatus = EDIT_STATUS_CONFIG[version.status];
                    const isLatest = i === editVersions.length - 1;
                    return (
                      <div
                        key={version.id}
                        className={cn(
                          "flex items-start gap-6 px-5 py-4",
                          i !== 0 && "border-t border-border",
                          isLatest && "bg-accent/20"
                        )}
                      >
                        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground/50 w-8 mt-0.5 shrink-0">
                          {version.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className={cn("text-sm font-semibold", editStatus?.color)}>
                              {editStatus?.label ?? version.status}
                            </span>
                            {version.sent_at && (
                              <span className="text-xs text-muted-foreground">
                                {shortDate(version.sent_at)}
                              </span>
                            )}
                          </div>
                          {version.notes && (
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {version.notes}
                            </p>
                          )}
                        </div>
                        {version.frameio_link && (
                          <a
                            href={version.frameio_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                          >
                            View <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Right column — Tasks + People */}
          <div className="w-full lg:w-72 shrink-0">

            {/* Tasks */}
            <section className="px-6 py-7 border-b border-border">
              <div className="flex items-center justify-between mb-5">
                <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/60">
                  Tasks
                </p>
              </div>

              <div className="space-y-0">
                {openTasks.map((task, i) => (
                  <div
                    key={task.id}
                    data-task-row
                    className={cn(
                      "flex items-start gap-3 py-3 group",
                      i !== 0 && "border-t border-border/50"
                    )}
                  >
                    <TaskCheckbox taskId={task.id} completed={task.completed} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-snug">{task.title}</p>
                      {task.due_date && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {formatDate(task.due_date)}
                        </p>
                      )}
                    </div>
                    <DeleteTaskButton taskId={task.id} />
                  </div>
                ))}

                {doneTasks.length > 0 && (
                  <>
                    <div className="border-t border-border/50 my-1" />
                    {doneTasks.map((task, i) => (
                      <div
                        key={task.id}
                        data-task-row
                        className={cn(
                          "flex items-start gap-3 py-3 opacity-35 group",
                          i !== 0 && "border-t border-border/30"
                        )}
                      >
                        <TaskCheckbox taskId={task.id} completed={task.completed} />
                        <p className="flex-1 text-sm text-muted-foreground line-through">{task.title}</p>
                        <DeleteTaskButton taskId={task.id} />
                      </div>
                    ))}
                  </>
                )}

                {tasks.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">No tasks yet.</p>
                )}
              </div>
            </section>

            {/* People */}
            <section className="px-6 py-7">
              <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/60 mb-5">
                People
              </p>
              <div className="space-y-4">
                {project.editor_name && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Editor</p>
                    <p className="text-sm font-medium text-foreground">{project.editor_name}</p>
                    {project.editor_email && (
                      <p className="text-xs text-muted-foreground mt-0.5">{project.editor_email}</p>
                    )}
                  </div>
                )}
                {project.client_email && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Client</p>
                    <p className="text-sm font-medium text-foreground">{project.client ?? project.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{project.client_email}</p>
                  </div>
                )}
                {!project.editor_name && !project.client_email && (
                  <p className="text-sm text-muted-foreground">No contacts added.</p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
