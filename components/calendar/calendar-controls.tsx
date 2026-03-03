"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarSync, Link2Off, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  connected: boolean;
}

export function CalendarControls({ connected }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);

  function connectGoogle() {
    window.location.href = "/api/google/connect";
  }

  function syncNow() {
    setError(null);
    setIsSyncing(true);
    startTransition(async () => {
      try {
        const res = await fetch("/api/google/sync", { method: "POST" });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || "Sync failed");
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sync failed");
      } finally {
        setIsSyncing(false);
      }
    });
  }

  function disconnect() {
    if (!confirm("Disconnect Google Calendar? Imported events will be removed.")) return;
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/google/disconnect", { method: "POST" });
        if (!res.ok) throw new Error("Disconnect failed");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Disconnect failed");
      }
    });
  }

  if (!connected) {
    return (
      <div className="flex flex-col items-end gap-2">
        <Button onClick={connectGoogle} className="gap-2">
          <CalendarSync className="w-4 h-4" />
          Connect Google Calendar
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <Button variant="outline" className="gap-2" onClick={disconnect} disabled={isPending || isSyncing}>
          <Link2Off className="w-4 h-4" />
          Disconnect
        </Button>
        <Button className="gap-2" onClick={syncNow} disabled={isPending || isSyncing}>
          <RefreshCcw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
          Sync Now
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
