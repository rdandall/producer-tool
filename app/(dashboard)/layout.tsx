import { Sidebar } from "@/components/layout/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { getProjects } from "@/lib/db/projects";
import { getAllTasks } from "@/lib/db/tasks";
import { Toaster } from "sonner";

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
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="relative z-10 flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </div>
      <CommandPalette projects={paletteProjects} tasks={paletteTasks} />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "oklch(1 0 0 / 0.85)",
            backdropFilter: "blur(16px) saturate(180%)",
            border: "1px solid oklch(0 0 0 / 0.08)",
            fontSize: "13px",
          },
        }}
      />
    </div>
  );
}
