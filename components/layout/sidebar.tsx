"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays, FolderKanban, FileText,
  Users, LayoutDashboard, Mic, CheckSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

const navItems = [
  { label: "Dashboard",       href: "/dashboard",           icon: LayoutDashboard },
  { label: "Projects",        href: "/dashboard/projects",  icon: FolderKanban },
  { label: "Tasks",           href: "/dashboard/tasks",     icon: CheckSquare },
  { label: "Calendar",        href: "/dashboard/calendar",  icon: CalendarDays },
  { label: "Notes & Briefs",  href: "/dashboard/notes",     icon: FileText,      disabled: true },
  { label: "Voice Dictation", href: "/dashboard/dictation", icon: Mic,           disabled: true },
  { label: "Team Briefs",     href: "/dashboard/team",      icon: Users,         disabled: true },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-52 min-h-screen bg-sidebar border-r border-sidebar-border shrink-0">

      {/* Wordmark + theme toggle */}
      <div className="px-5 h-14 flex items-center justify-between border-b border-sidebar-border">
        <span className="font-black text-xl tracking-[-0.04em] text-foreground">
          PRDCR
        </span>
        <ThemeToggle />
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          if (item.disabled) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 px-5 py-2.5 text-[13px] border-l-2 border-transparent text-muted-foreground/30 cursor-default select-none"
                title="Coming soon"
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-5 py-2.5 text-[13px] transition-colors relative border-l-2",
                isActive
                  ? "border-primary text-foreground bg-sidebar-accent font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0", isActive && "text-primary")} />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
