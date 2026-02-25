import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Mic, Plus } from "lucide-react";

export default function NotesPage() {
  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Notes & Transcripts
          </h1>
          <p className="text-muted-foreground mt-1">
            Meeting notes from Otter.ai, dictation, and manual entries — all turned into action items.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Mic className="w-4 h-4" />
            Dictate
          </Button>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            New Note
          </Button>
        </div>
      </div>

      <Card className="border-dashed border-2">
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <h3 className="font-medium text-foreground mb-2">Notes & Transcripts coming soon</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Otter.ai integration, voice dictation with AI formatting, and role-based task generation will be built here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
