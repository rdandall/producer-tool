import { getProjects } from "@/lib/db/projects";
import { getAllTasks } from "@/lib/db/tasks";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default async function DashboardPage() {
  const [projects, tasks] = await Promise.all([getProjects(), getAllTasks()]);
  return <DashboardClient projects={projects} tasks={tasks} />;
}
