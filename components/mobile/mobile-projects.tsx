"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { STATUS_CONFIG } from "@/lib/mock-data";
import { daysUntil } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { NewProjectForm } from "@/components/projects/new-project-form";
import type { Project } from "@/lib/db/projects";

interface ClientOption {
  id: string;
  name: string;
}

interface Props {
  projects: Project[];
  clients?: ClientOption[];
}

const STATUS_FILTERS = [
  "all", "idea", "pre-production", "filming", "editing", "review", "delivered",
] as const;

export function MobileProjects({ projects, clients = [] }: Props) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showNewForm, setShowNewForm] = useState(false);

  const filtered =
    statusFilter === "all"
      ? projects
      : projects.filter((p) => p.status === statusFilter);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-black tracking-tight">Projects</h1>
          <Button
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => setShowNewForm(true)}
          >
            <Plus className="w-3.5 h-3.5" /> New
          </Button>
        </div>

        {/* Status filters */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-2.5 py-1 text-[10px] font-medium capitalize whitespace-nowrap transition-colors rounded-full shrink-0",
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground"
              )}
            >
              {s === "all" ? "All" : s.replace("-", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {filtered.length > 0 ? (
          <div className="space-y-2">
            {filtered.map((project) => {
              const status = STATUS_CONFIG[project.status];
              const deadline = project.due_date ? daysUntil(project.due_date) : null;

              return (
                <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
                  <Card className="overflow-hidden active:scale-[0.98] transition-transform">
                    <CardContent className="px-4 py-3.5">
                      <div className="flex items-start gap-3">
                        <div
                          className="w-1 self-stretch rounded-full shrink-0 mt-0.5"
                          style={{ backgroundColor: project.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[13px] font-semibold text-foreground truncate">
                              {project.title}
                            </p>
                            {status && (
                              <span className={cn("status-pill text-[9px] shrink-0", status.bg, status.color)}>
                                <span className={cn("w-1.5 h-1.5 rounded-full", status.dot)} />
                                {status.label}
                              </span>
                            )}
                          </div>
                          {project.client && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {project.client}
                            </p>
                          )}
                          {deadline && (
                            <p
                              className={cn(
                                "text-[10px] mt-1",
                                deadline.overdue
                                  ? "text-destructive font-medium"
                                  : "text-muted-foreground/60"
                              )}
                            >
                              {deadline.label}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center">
            <p className="text-[13px] text-muted-foreground">No projects found</p>
          </div>
        )}
      </div>

      {/* New project sheet */}
      {showNewForm && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="fixed inset-0 z-50 flex flex-col bg-background"
        >
          <div className="flex items-center gap-3 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))] border-b border-border/30">
            <button
              onClick={() => setShowNewForm(false)}
              className="w-8 h-8 flex items-center justify-center text-muted-foreground"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-sm font-semibold">New Project</h2>
          </div>
          <div className="flex-1 overflow-auto px-5 py-4">
            <NewProjectForm clients={clients} />
          </div>
        </motion.div>
      )}
    </div>
  );
}
