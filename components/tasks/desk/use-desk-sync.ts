"use client";

import { useEffect, useRef, useState } from "react";
import { durableDesk, equal, mergeDesk, validDesk, type CloudDesk, type DeskState } from "@/lib/desk/state";

export function useDeskSync(enabled: boolean, ready: boolean, data: DeskState, apply: (data: DeskState) => void) {
  const [status, setStatus] = useState("Connecting…");
  const latest = useRef(data);
  const applyRef = useRef(apply);
  const trigger = useRef<(() => void) | null>(null);
  const serialized = JSON.stringify(durableDesk(data));
  useEffect(() => { applyRef.current = apply; }, [apply]);
  useEffect(() => {
    latest.current = JSON.parse(serialized);
    if (enabled && ready) trigger.current?.();
  }, [serialized, enabled, ready]);

  useEffect(() => {
    if (!enabled || !ready) return;
    const baseKey = "prdcr-desk-live-v1-cloud-base";
    let base: DeskState | null = null;
    try {
      const stored = JSON.parse(localStorage.getItem(baseKey) ?? "null");
      if (validDesk(stored)) base = stored;
    } catch { /* Recover from the current local cards instead. */ }
    let stopped = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let firstLoad = true;
    const report = (message: string) => { if (!stopped) setStatus(message); };
    const rememberBase = (value: DeskState) => {
      base = value;
      try {
        // Keep the local snapshot and its comparison base together, even if a
        // response arrives after navigating away from the Desk.
        localStorage.setItem("prdcr-desk-live-v1", JSON.stringify(latest.current.cards));
        localStorage.setItem("prdcr-desk-live-v1-card-size", latest.current.preferences.cardSize);
        localStorage.setItem("prdcr-desk-live-v1-preferences", JSON.stringify(latest.current.preferences));
        localStorage.setItem(baseKey, JSON.stringify(value));
      } catch { /* Still save online. */ }
    };
    async function responseState(response: Response): Promise<CloudDesk> {
      if (response.redirected || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Sign in again to sync your desk");
      const result = await response.json();
      if ((!response.ok && response.status !== 409) || !validDesk(result.data) || (result.revision !== null && typeof result.revision !== "string")) throw new Error(result.error || "Could not sync");
      return result;
    }
    async function sync() {
      if (busy) return;
      busy = true;
      try {
        let remote = await responseState(await fetch("/api/desk", { cache: "no-store" }));
        for (let attempt = 0; attempt < 4; attempt++) {
          const local = latest.current;
          const merged = base ? mergeDesk(base, local, remote.data) : remote.revision === null ? local : {
            // First visit after migration: import only this browser's unique cards.
            // Previously synced cards always retain their newer cloud contents.
            cards: [...remote.data.cards, ...local.cards.filter((card) => !remote.data.cards.some((other) => other.id === card.id))],
            preferences: remote.data.preferences,
          };
          if (!equal(local, merged)) {
            latest.current = merged;
            if (!stopped) applyRef.current(merged);
          }
          rememberBase(remote.data);
          firstLoad = false;
          if (equal(merged, remote.data)) { report("Saved across devices"); break; }
          report("Saving…");
          const response = await fetch("/api/desk", {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ revision: remote.revision, data: merged }),
            keepalive: new Blob([JSON.stringify(merged)]).size < 60000,
          });
          remote = await responseState(response);
          if (response.status === 409) continue;
          rememberBase(remote.data);
          report(equal(latest.current, base) ? "Saved across devices" : "Saving…");
          break;
        }
      } catch {
        report("Saved locally · sync pending");
      } finally {
        busy = false;
        if (!stopped && base && !equal(latest.current, base)) {
          clearTimeout(timer); timer = setTimeout(() => void sync(), 2500);
        }
      }
    }
    const queue = () => {
      if (base && equal(latest.current, base)) return;
      report(firstLoad ? "Connecting…" : "Saving…");
      clearTimeout(timer); timer = setTimeout(() => void sync(), 400);
    };
    const refresh = () => { if (!document.hidden) void sync(); };
    trigger.current = queue;
    void sync();
    const poll = setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stopped = true; clearTimeout(timer); clearInterval(poll); trigger.current = null;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
      // Navigation within PRDCR still flushes the last edit. Local backups remain
      // available if a tab closes before the request can reach the server.
      if (base && !equal(latest.current, base)) void sync();
    };
  }, [enabled, ready]);
  return status;
}
