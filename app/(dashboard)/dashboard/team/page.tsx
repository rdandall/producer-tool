import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Plus } from "lucide-react";

export default function TeamPage() {
  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Team Briefs
          </h1>
          <p className="text-muted-foreground mt-1">
            Organized notes and briefs by role — editors, cinematographers, sound, and more.
          </p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Create Brief
        </Button>
      </div>

      <Card className="border-dashed border-2">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <h3 className="font-medium text-foreground mb-2">Team Briefs coming soon</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Role-specific crew briefs, shareable links, and team communication tools will be built here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
