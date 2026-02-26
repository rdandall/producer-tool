"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  FolderKanban,
  CheckSquare,
  LayoutDashboard,
  ListTodo,
  Search,
} from "lucide-react";

interface Project {
  id: string;
  title: string;
  client: string | null;
  color: string;
}

interface Task {
  id: string;
  title: string;
  completed: boolean;
  project_id: string | null;
}

interface Props {
  projects: Project[];
  tasks: Task[];
}

const PAGES = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/dashboard/projects", icon: FolderKanban },
  { label: "Tasks", href: "/dashboard/tasks", icon: ListTodo },
];

export function CommandPalette({ projects, tasks }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  /* ── Keyboard shortcut ────────────────────────────────── */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <div className="relative max-w-lg w-full mx-auto mt-[20vh]">
        <Command
          className="bg-background border border-border shadow-2xl overflow-hidden"
          loop
        >
          <div className="flex items-center gap-2 px-4 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground/50 shrink-0" />
            <Command.Input
              placeholder="Search projects, tasks, or pages…"
              className="w-full py-3.5 text-sm bg-transparent outline-none placeholder:text-muted-foreground/40"
              autoFocus
            />
            <kbd className="text-[10px] text-muted-foreground/40 font-mono border border-border px-1.5 py-0.5 shrink-0">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-72 overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            {/* Pages */}
            <Command.Group
              heading="Pages"
              className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/50 px-2 pt-2 pb-1"
            >
              {PAGES.map((page) => {
                const Icon = page.icon;
                return (
                  <Command.Item
                    key={page.href}
                    value={page.label}
                    onSelect={() => go(page.href)}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-foreground cursor-pointer rounded-sm data-[selected=true]:bg-accent/50 transition-colors"
                  >
                    <Icon className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                    {page.label}
                  </Command.Item>
                );
              })}
            </Command.Group>

            {/* Projects */}
            {projects.length > 0 && (
              <Command.Group
                heading="Projects"
                className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/50 px-2 pt-3 pb-1"
              >
                {projects.map((project) => (
                  <Command.Item
                    key={project.id}
                    value={`${project.title} ${project.client ?? ""}`}
                    onSelect={() => go(`/dashboard/projects/${project.id}`)}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-foreground cursor-pointer rounded-sm data-[selected=true]:bg-accent/50 transition-colors"
                  >
                    <div
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="flex-1 truncate">{project.title}</span>
                    {project.client && (
                      <span className="text-xs text-muted-foreground/50 shrink-0">
                        {project.client}
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Tasks */}
            {tasks.length > 0 && (
              <Command.Group
                heading="Tasks"
                className="text-[10px] uppercase tracking-[0.12em] font-semibold text-muted-foreground/50 px-2 pt-3 pb-1"
              >
                {tasks.filter((t) => !t.completed).slice(0, 10).map((task) => (
                  <Command.Item
                    key={task.id}
                    value={task.title}
                    onSelect={() =>
                      go(
                        task.project_id
                          ? `/dashboard/projects/${task.project_id}`
                          : "/dashboard/tasks"
                      )
                    }
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-foreground cursor-pointer rounded-sm data-[selected=true]:bg-accent/50 transition-colors"
                  >
                    <CheckSquare className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                    <span className="flex-1 truncate">{task.title}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
