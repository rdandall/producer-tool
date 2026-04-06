"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Plus, X, ChevronRight, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ClientWithProjects } from "@/lib/db/clients";

interface UnassignedProject {
  id: string;
  title: string;
  status: string;
  color: string;
  due_date: string | null;
  ongoing: boolean;
  client: string | null;
}

interface Props {
  clients: ClientWithProjects[];
  unassignedProjects: UnassignedProject[];
}

export function MobileClients({ clients, unassignedProjects }: Props) {
  const [selectedClient, setSelectedClient] = useState<ClientWithProjects | null>(null);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 bg-background/80 backdrop-blur-xl border-b border-border/30">
        <h1 className="text-lg font-black tracking-tight">Clients</h1>
      </div>

      {/* Client list */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {clients.length > 0 ? (
          <div className="space-y-2">
            {clients.map((client) => (
              <button
                key={client.id}
                onClick={() => setSelectedClient(client)}
                className="w-full text-left"
              >
                <Card className="overflow-hidden active:scale-[0.98] transition-transform">
                  <CardContent className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-foreground truncate">
                          {client.name}
                        </p>
                        {client.contact_name && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            {client.contact_name}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <Building2 className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-[13px] text-muted-foreground">No clients yet</p>
          </div>
        )}
      </div>

      {/* Client detail sheet */}
      <AnimatePresence>
        {selectedClient && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-50 flex flex-col bg-background"
          >
            <div className="flex items-center gap-3 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))] border-b border-border/30">
              <button
                onClick={() => setSelectedClient(null)}
                className="w-8 h-8 flex items-center justify-center text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
              <h2 className="text-sm font-semibold flex-1 truncate">{selectedClient.name}</h2>
            </div>
            <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
              {selectedClient.contact_name && (
                <div>
                  <p className="label-xs">Contact</p>
                  <p className="text-sm">{selectedClient.contact_name}</p>
                </div>
              )}
              {selectedClient.contact_email && (
                <div>
                  <p className="label-xs">Email</p>
                  <a
                    href={`mailto:${selectedClient.contact_email}`}
                    className="text-sm text-primary flex items-center gap-1.5"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {selectedClient.contact_email}
                  </a>
                </div>
              )}
              {selectedClient.notes && (
                <div>
                  <p className="label-xs">Notes</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedClient.notes}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
