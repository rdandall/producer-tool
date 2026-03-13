import { getAllClients } from "@/lib/db/clients";
import { getProjects } from "@/lib/db/projects";
import { ClientsClient } from "@/components/clients/clients-client";

export default async function ClientsPage() {
  const [clients, projects] = await Promise.all([
    getAllClients(),
    getProjects(),
  ]);

  // Projects with no client_id assigned
  const assignedProjectIds = new Set(
    clients.flatMap((c) => c.projects.map((p) => p.id))
  );

  const unassignedProjects = projects
    .filter((p) => !assignedProjectIds.has(p.id))
    .map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      color: p.color,
      due_date: p.due_date,
      ongoing: p.ongoing,
      client: p.client,
    }));

  return (
    <ClientsClient
      clients={clients}
      unassignedProjects={unassignedProjects}
    />
  );
}
