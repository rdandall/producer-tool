"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Development asset URLs are reused between edits, unlike production hashes.
      // An old cache-first worker can otherwise hide new styles after a reload.
      if (process.env.NODE_ENV !== "production") {
        void navigator.serviceWorker.getRegistration("/")
          .then((registration) => registration?.unregister())
          .catch(() => {});
        return;
      }
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Check for updates every 30 minutes
          setInterval(() => reg.update(), 30 * 60 * 1000);
        })
        .catch((err) => {
          console.warn("SW registration failed:", err);
        });
    }
  }, []);

  return null;
}
