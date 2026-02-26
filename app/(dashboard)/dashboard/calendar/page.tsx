import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, Plus, Mail } from "lucide-react";

export default function CalendarPage() {
  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-primary" />
            Calendar
          </h1>
          <p className="text-muted-foreground mt-1">
            Shoot days, deadlines, and project milestones — all in one place.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Mail className="w-4 h-4" />
            Scan Emails
          </Button>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Add Event
          </Button>
        </div>
      </div>

      <Card className="min-h-[520px]">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <CalendarDays className="w-12 h-12 text-muted-foreground/45 mb-4" />
          <h3 className="font-medium text-foreground mb-2">Calendar coming soon</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            A full visual calendar with shoot days, deadlines, and email scanning will be built here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
