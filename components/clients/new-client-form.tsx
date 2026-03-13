"use client";

import { useState, useTransition } from "react";
import { createClientAction } from "@/app/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const COLORS = [
  "#f59e0b", "#8b5cf6", "#3b82f6", "#10b981",
  "#ef4444", "#f97316", "#ec4899", "#6366f1",
];

const fieldClass =
  "w-full text-sm bg-background border border-border px-3 py-2 text-foreground " +
  "placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary transition-colors";

interface Props {
  trigger?: React.ReactNode;
  onCreated?: (clientId: string) => void;
}

export function NewClientForm({ trigger, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(COLORS[2]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("color", color);
    setError(null);

    startTransition(async () => {
      try {
        const id = await createClientAction(fd);
        setOpen(false);
        onCreated?.(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gap-1.5 text-xs h-8">
            <Plus className="w-3.5 h-3.5" />
            New Client
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">New Client</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Name */}
          <div>
            <label className="label-xs">Client / Company Name *</label>
            <input
              name="name"
              required
              placeholder="Michael Blake for Congress"
              className={fieldClass}
            />
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-xs">Primary Contact</label>
              <input name="contact_name" placeholder="Michael Blake" className={fieldClass} />
            </div>
            <div>
              <label className="label-xs">Contact Email</label>
              <input name="contact_email" type="email" placeholder="michael@..." className={fieldClass} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="label-xs">Notes</label>
            <textarea
              name="notes"
              rows={2}
              placeholder="Ongoing relationship, congressional campaign…"
              className={cn(fieldClass, "resize-none")}
            />
          </div>

          {/* Colour */}
          <div>
            <label className="label-xs">Colour</label>
            <div className="flex gap-2 mt-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "w-6 h-6 rounded-full transition-transform",
                    color === c && "ring-2 ring-offset-2 ring-foreground/30 scale-110"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className="text-xs h-8" disabled={isPending}>
              {isPending ? "Creating…" : "Create Client"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
