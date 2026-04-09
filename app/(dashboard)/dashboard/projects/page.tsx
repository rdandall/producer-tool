import { getProjects } from "@/lib/db/projects";
import { getAllClients } from "@/lib/db/clients";
import { ProjectsClient } from "@/components/projects/projects-client";

export default async function ProjectsPage() {
  const [projects, clients] = await Promise.all([
    getProjects(),
    getAllClients(),
  ]);

  const clientOptions = clients.map((c) => ({ id: c.id, name: c.name }));

  return <ProjectsClient projects={projects} clients={clientOptions} />;
}
