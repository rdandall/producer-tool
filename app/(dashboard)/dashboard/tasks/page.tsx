import { getAllTasks } from "@/lib/db/tasks";
import { getProjects } from "@/lib/db/projects";
import { TasksClient } from "@/components/tasks/tasks-client";
import { MobileTasks } from "@/components/mobile/mobile-tasks";
import { ResponsivePage } from "@/components/mobile/responsive-page";

export default async function TasksPage() {
  const [tasks, projects] = await Promise.all([getAllTasks(), getProjects()]);
  return (
    <ResponsivePage
      desktop={<TasksClient tasks={tasks} projects={projects} />}
      mobile={<MobileTasks tasks={tasks} projects={projects} />}
    />
  );
}
