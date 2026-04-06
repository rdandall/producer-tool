"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  CalendarDays,
  Mail,
  FileText,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const tabs = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "Tasks", href: "/dashboard/tasks", icon: CheckSquare },
  { label: "Email", href: "/dashboard/email", icon: Mail },
  { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays },
  { label: "More", href: "#more", icon: MoreHorizontal },
];

const moreItems = [
  { label: "Projects", href: "/dashboard/projects", icon: FolderKanban },
  { label: "Notes & Briefs", href: "/dashboard/notes", icon: FileText },
  { label: "Clients", href: "/dashboard/clients", icon: FolderKanban },
  { label: "Settings", href: "/dashboard/settings", icon: MoreHorizontal },
];

interface MobileShellProps {
  children: React.ReactNode;
}

export function MobileShell({ children }: MobileShellProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);

  // Check if current page is in the "more" section
  const isMoreActive = moreItems.some((item) => isActive(item.href));

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden">
      {/* ── Main content area ── */}
      <main className="flex-1 overflow-hidden">{children}</main>

      {/* ── Bottom tab bar ── */}
      <nav
        className={cn(
          "shrink-0 border-t border-border/50",
          "bg-background/80 backdrop-blur-xl",
          "pb-[env(safe-area-inset-bottom)]"
        )}
      >
        <div className="flex items-stretch">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = tab.href === "#more" ? isMoreActive : isActive(tab.href);

            if (tab.href === "#more") {
              return (
                <button
                  key="more"
                  onClick={() => setMoreOpen(true)}
                  className={cn(
                    "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 pt-2.5 transition-colors",
                    active
                      ? "text-primary"
                      : "text-muted-foreground/60"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 pt-2.5 transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground/60"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── "More" sheet ── */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[env(safe-area-inset-bottom)]" showCloseButton>
          <div className="space-y-1 pt-2 pb-4">
            <div className="flex items-center justify-between mb-4 px-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50">
                More
              </span>
              <ThemeToggle />
            </div>
            {moreItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-3.5 px-3 py-3.5 rounded-lg transition-colors",
                    isActive(item.href)
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-accent/30"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
