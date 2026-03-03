import { getProjects } from "@/lib/db/projects";
import { getAllTasks } from "@/lib/db/tasks";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [projects, tasks] = await Promise.all([getProjects(), getAllTasks()]);

  // Slim down data for the command palette (only what's needed for search)
  const paletteProjects = projects.map((p) => ({
    id: p.id,
    title: p.title,
    client: p.client,
    color: p.color,
  }));

  const paletteTasks = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    completed: t.completed,
    project_id: t.project_id,
  }));

  return (
    <DashboardShell projects={paletteProjects} tasks={paletteTasks}>
      {children}
    </DashboardShell>
  );
}
