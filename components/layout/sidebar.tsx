"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  FolderKanban,
  FileText,
  Users,
  LayoutDashboard,
  CheckSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/dashboard/projects", icon: FolderKanban },
  { label: "Tasks", href: "/dashboard/tasks", icon: CheckSquare },
  { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays },
  { label: "Notes & Briefs", href: "/dashboard/notes", icon: FileText },
  { label: "Email", href: "/dashboard/email", icon: Mail },
  { label: "Team", href: "/dashboard/team", icon: Users, disabled: true },
];

interface SidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({
  mobile = false,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname();

  const asideClass = mobile
    ? "flex flex-col w-full h-full bg-sidebar"
    : cn(
        "hidden md:flex flex-col min-h-screen bg-sidebar border-r border-sidebar-border shrink-0 transition-all duration-200",
        collapsed ? "w-16" : "w-56"
      );

  return (
    <aside className={asideClass}>
      <div
        className={cn(
          "h-14 flex items-center border-b border-sidebar-border",
          collapsed ? "px-2 justify-center" : "px-4 justify-between"
        )}
      >
        <span
          className={cn(
            "font-black tracking-[-0.04em] text-foreground",
            collapsed ? "text-sm" : "text-xl"
          )}
        >
          {collapsed ? "P" : "PRDCR"}
        </span>

        <div className="flex items-center gap-1">
          {!collapsed && <ThemeToggle />}
          {!mobile && onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {mobile && (
        <div className="px-4 py-2 border-b border-sidebar-border flex justify-end">
          <ThemeToggle />
        </div>
      )}

      <nav className="flex-1 py-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const showIconTooltip = collapsed && !mobile;

          if (item.disabled) {
            const disabledItem = (
              <div
                key={item.href}
                className={cn(
                  "flex items-center py-2.5 text-[13px] border-l-2 border-transparent text-muted-foreground/30 cursor-default select-none",
                  collapsed ? "justify-center px-2" : "gap-3 px-4"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="flex-1">{item.label}</span>}
              </div>
            );

            if (!showIconTooltip) return disabledItem;

            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{disabledItem}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.label} (Coming soon)
                </TooltipContent>
              </Tooltip>
            );
          }

          const navLink = (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center py-2.5 text-[13px] transition-colors relative border-l-2",
                collapsed ? "justify-center px-2" : "gap-3 px-4",
                isActive
                  ? "border-primary text-foreground bg-sidebar-accent font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0", isActive && "text-primary")} />
              {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
            </Link>
          );

          if (!showIconTooltip) return navLink;

          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>{navLink}</TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </aside>
  );
}
