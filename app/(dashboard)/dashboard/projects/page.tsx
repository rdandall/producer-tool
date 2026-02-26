import { getProjects } from "@/lib/db/projects";
import { ProjectsClient } from "@/components/projects/projects-client";

export default async function ProjectsPage() {
  const projects = await getProjects();
  return <ProjectsClient projects={projects} />;
}
