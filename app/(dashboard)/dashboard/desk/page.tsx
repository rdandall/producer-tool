import { getProjects } from "@/lib/db/projects";
import { Desk } from "@/components/tasks/desk/desk";

export const metadata = { title: "The Desk — PRDCR" };

export default async function DeskPage() {
  const projects = await getProjects();
  return <Desk embedded projects={projects.map(({ title, color }) => ({ title, color }))} />;
}
