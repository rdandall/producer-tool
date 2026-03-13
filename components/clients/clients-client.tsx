"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Building2, Mail, Plus, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG } from "@/lib/mock-data";
import { NewClientForm } from "./new-client-form";
import { NewProjectForm } from "@/components/projects/new-project-form";
import type { ClientWithProjects } from "@/lib/db/clients";
import type { Client } from "@/lib/db/clients";

const STATUS_ORDER = [
  "filming", "editing", "review", "pre-production", "idea", "delivered",
];

const STATUS_FILTERS = [
  "all", "idea", "pre-production", "filming", "editing", "review", "delivered",
] as const;

interface Props {
  clients: ClientWithProjects[];
  unassignedProjects: Array<{
    id: string;
    title: string;
    status: string;
    color: string;
    due_date: string | null;
    ongoing: boolean;
    client: string | null;
  }>;
}

function sortProjects<T extends { status: string }>(projects: T[]): T[] {
  return [...projects].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
  );
}

function ProjectPill({
  project,
}: {
  project: { id: string; title: string; status: string; color: string };
}) {
  const statusCfg = STATUS_CONFIG[project.status];
  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      className="group flex items-center gap-2 px-3 py-2 border border-border/40 bg-background hover:border-primary/30 hover:bg-accent/20 transition-all"
    >
      <div className="w-1 h-5 shrink-0" style={{ backgroundColor: project.color }} />
      <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors flex-1 truncate">
        {project.title}
      </span>
      {statusCfg && (
        <span className={cn("text-[10px] px-1.5 py-px font-semibold shrink-0", statusCfg.color)}>
          {statusCfg.label}
        </span>
      )}
      <ArrowUpRight className="w-3 h-3 text-muted-foreground/20 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
    </Link>
  );
}

function ClientCard({
  client,
  statusFilter,
  allClients,
}: {
  client: ClientWithProjects;
  statusFilter: string;
  allClients: Client[];
}) {
  const filtered =
    statusFilter === "all"
      ? sortProjects(client.projects)
      : sortProjects(client.projects.filter((p) => p.status === statusFilter));

  const activeCount = client.projects.filter(
    (p) => p.status !== "delivered" && p.status !== "idea"
  ).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="border border-border bg-background overflow-hidden"
    >
      {/* Color bar */}
      <div className="h-1" style={{ backgroundColor: client.color }} />

      {/* Client header */}
      <div className="px-5 py-4 border-b border-border/50 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
            <h2 className="text-sm font-bold text-foreground leading-none truncate">
              {client.name}
            </h2>
            {activeCount > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-px bg-primary/10 text-primary shrink-0">
                {activeCount} active
              </span>
            )}
          </div>
          {(client.contact_name || client.contact_email) && (
            <div className="flex items-center gap-3 mt-1.5">
              {client.contact_name && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                  <User className="w-3 h-3" />
                  {client.contact_name}
                </span>
              )}
              {client.contact_email && (
                <a
                  href={`mailto:${client.contact_email}`}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-primary transition-colors"
                >
                  <Mail className="w-3 h-3" />
                  {client.contact_email}
                </a>
              )}
            </div>
          )}
          {client.notes && (
            <p className="text-[11px] text-muted-foreground/50 mt-1.5 line-clamp-1">
              {client.notes}
            </p>
          )}
        </div>
        <NewProjectForm clients={allClients} defaultClientId={client.id} trigger={
          <button className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground/50 hover:text-primary border border-border/40 hover:border-primary/30 px-2.5 py-1.5 transition-all shrink-0">
            <Plus className="w-3 h-3" />
            Project
          </button>
        } />
      </div>

      {/* Projects list */}
      <div className="divide-y divide-border/30">
        {filtered.length === 0 ? (
          <p className="px-5 py-4 text-[11px] text-muted-foreground/40 italic">
            {statusFilter === "all"
              ? "No projects yet."
              : `No ${statusFilter} projects.`}
          </p>
        ) : (
          filtered.map((p) => <ProjectPill key={p.id} project={p} />)
        )}
      </div>

      {/* Total count footer */}
      {client.projects.length > 0 && (
        <div className="px-5 py-2.5 border-t border-border/30 bg-sidebar-accent/10">
          <p className="text-[10px] text-muted-foreground/40">
            {client.projects.length} project{client.projects.length !== 1 ? "s" : ""} total
            {statusFilter !== "all" && filtered.length !== client.projects.length
              ? ` · ${filtered.length} shown`
              : ""}
          </p>
        </div>
      )}
    </motion.div>
  );
}

export function ClientsClient({ clients, unassignedProjects }: Props) {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const allClients: Client[] = clients.map(({ projects: _p, ...c }) => c);

  const filteredUnassigned =
    statusFilter === "all"
      ? sortProjects(unassignedProjects)
      : sortProjects(unassignedProjects.filter((p) => p.status === statusFilter));

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between px-4 sm:px-8 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Clients
          </h1>
          <span className="text-xs text-muted-foreground/50">
            {clients.length} client{clients.length !== 1 ? "s" : ""}
          </span>
        </div>
        <NewClientForm />
      </div>

      {/* Status filter chips */}
      <div className="flex items-center gap-1.5 px-4 sm:px-8 py-2.5 border-b border-border/50 shrink-0 overflow-x-auto scrollbar-none">
        {STATUS_FILTERS.map((s) => {
          const label = s === "all" ? "All" : (STATUS_CONFIG[s]?.label ?? s);
          const active = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "text-[11px] px-2.5 py-1 font-medium transition-colors shrink-0",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground/50 hover:text-foreground hover:bg-accent/40"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Client cards grid */}
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-6">
        {clients.length === 0 && unassignedProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Building2 className="w-10 h-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground/50">No clients yet.</p>
            <p className="text-xs text-muted-foreground/40">Create a client to group your projects.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {clients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                statusFilter={statusFilter}
                allClients={allClients}
              />
            ))}

            {/* Unassigned projects */}
            {unassignedProjects.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: clients.length * 0.05 }}
                className="border border-border/40 bg-background overflow-hidden border-dashed"
              >
                <div className="h-1 bg-border/40" />
                <div className="px-5 py-4 border-b border-border/30">
                  <h2 className="text-sm font-semibold text-muted-foreground/60">
                    Unassigned
                  </h2>
                  <p className="text-[11px] text-muted-foreground/40 mt-0.5">
                    {unassignedProjects.length} project{unassignedProjects.length !== 1 ? "s" : ""} without a client
                  </p>
                </div>
                <div className="divide-y divide-border/30">
                  {filteredUnassigned.map((p) => (
                    <ProjectPill key={p.id} project={p} />
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
