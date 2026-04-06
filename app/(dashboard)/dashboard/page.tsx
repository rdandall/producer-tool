import { getProjects } from "@/lib/db/projects";
import { getAllTasks } from "@/lib/db/tasks";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { MobileDashboard } from "@/components/mobile/mobile-dashboard";
import { ResponsivePage } from "@/components/mobile/responsive-page";

export default async function DashboardPage() {
  const [projects, tasks] = await Promise.all([getProjects(), getAllTasks()]);
  return (
    <ResponsivePage
      desktop={<DashboardClient projects={projects} tasks={tasks} />}
      mobile={<MobileDashboard projects={projects} tasks={tasks} />}
    />
  );
}
