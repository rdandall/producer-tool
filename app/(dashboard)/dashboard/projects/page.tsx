import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FolderKanban, Plus } from "lucide-react";

export default function ProjectsPage() {
  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-primary" />
            Projects
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage all your productions from development through delivery.
          </p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          New Project
        </Button>
      </div>

      <Card className="border-dashed border-2">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <FolderKanban className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <h3 className="font-medium text-foreground mb-2">Projects coming soon</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Project cards with status tracking, shoot days, team members, and deadlines will be built here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
