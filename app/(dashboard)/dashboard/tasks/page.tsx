import { getAllTasks } from "@/lib/db/tasks";
import { getProjects } from "@/lib/db/projects";
import { TasksClient } from "@/components/tasks/tasks-client";

export default async function TasksPage() {
  const [tasks, projects] = await Promise.all([getAllTasks(), getProjects()]);
  return <TasksClient tasks={tasks} projects={projects} />;
}
