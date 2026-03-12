"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { GlobalAssistant } from "@/components/assistant/global-assistant";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Toaster } from "sonner";

interface PaletteProject {
  id: string;
  title: string;
  client: string | null;
  color: string;
}

interface PaletteTask {
  id: string;
  title: string;
  completed: boolean;
  project_id: string | null;
}

interface DashboardShellProps {
  children: React.ReactNode;
  projects: PaletteProject[];
  tasks: PaletteTask[];
}

export function DashboardShell({ children, projects, tasks }: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("prdcr-sidebar-collapsed") === "true";
  });

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("prdcr-sidebar-collapsed", String(next));
      }
      return next;
    });
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />

      <div className="relative z-10 flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="md:hidden h-14 border-b border-border flex items-center gap-3 px-4 bg-background/85 backdrop-blur-md">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label="Open navigation"
              >
                <Menu className="w-5 h-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-[280px]" showCloseButton>
              <Sidebar mobile onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="font-black tracking-[-0.04em] text-lg text-foreground">PRDCR</span>
        </div>

        {children}
      </div>

      <CommandPalette projects={projects} tasks={tasks} />
      <GlobalAssistant projects={projects} />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "oklch(1 0 0 / 0.85)",
            backdropFilter: "blur(16px) saturate(180%)",
            border: "1px solid oklch(0 0 0 / 0.08)",
            fontSize: "13px",
          },
        }}
      />
    </div>
  );
}
