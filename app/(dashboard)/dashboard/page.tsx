import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, FileText, FolderKanban, Mic, Plus, Users } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex-1 p-8 overflow-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-sm text-muted-foreground mb-1">{today}</p>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        </div>
        <Link href="/dashboard/projects">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            New Project
          </Button>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        {[
          { icon: CalendarDays, label: "Add Shoot Day", href: "/dashboard/calendar", color: "text-amber-400" },
          { icon: Mic, label: "Start Dictation", href: "/dashboard/dictation", color: "text-green-400" },
          { icon: FileText, label: "New Note", href: "/dashboard/notes", color: "text-blue-400" },
          { icon: Users, label: "Create Team Brief", href: "/dashboard/team", color: "text-purple-400" },
        ].map((action) => (
          <Link key={action.label} href={action.href}>
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
              <CardContent className="flex items-center gap-3 p-4">
                <action.icon className={`w-5 h-5 shrink-0 ${action.color}`} />
                <span className="text-sm font-medium">{action.label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Empty state panels — will populate as you use the tool */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          {
            icon: CalendarDays,
            title: "Upcoming",
            description: "Shoot days and deadlines will appear here once you add them to the calendar.",
            href: "/dashboard/calendar",
            linkLabel: "Open calendar",
          },
          {
            icon: FolderKanban,
            title: "Active Projects",
            description: "Your projects will appear here. Create your first one to get started.",
            href: "/dashboard/projects",
            linkLabel: "Create project",
          },
          {
            icon: FileText,
            title: "Recent Notes",
            description: "Notes from dictation, Otter.ai imports, and manual entries will show here.",
            href: "/dashboard/notes",
            linkLabel: "Add a note",
          },
        ].map((panel) => (
          <Card key={panel.title} className="border border-border">
            <CardContent className="p-5">
              <h2 className="font-medium text-foreground flex items-center gap-2 mb-3">
                <panel.icon className="w-4 h-4 text-primary" />
                {panel.title}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                {panel.description}
              </p>
              <Link href={panel.href}>
                <Button variant="outline" size="sm" className="text-xs">
                  {panel.linkLabel}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
