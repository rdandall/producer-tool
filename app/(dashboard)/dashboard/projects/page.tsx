import { getProjects } from "@/lib/db/projects";
import { getAllClients } from "@/lib/db/clients";
import { ProjectsClient } from "@/components/projects/projects-client";
import { MobileProjects } from "@/components/mobile/mobile-projects";
import { ResponsivePage } from "@/components/mobile/responsive-page";

export default async function ProjectsPage() {
  const [projects, clients] = await Promise.all([
    getProjects(),
    getAllClients(),
  ]);

  const clientOptions = clients.map((c) => ({ id: c.id, name: c.name }));

  return (
    <ResponsivePage
      desktop={<ProjectsClient projects={projects} clients={clientOptions} />}
      mobile={<MobileProjects projects={projects} clients={clientOptions} />}
    />
  );
}
