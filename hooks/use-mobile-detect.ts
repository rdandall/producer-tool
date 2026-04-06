"use client";

import { useState, useEffect } from "react";

/**
 * Detects if the user is on a mobile device.
 * Uses both screen width and user agent for reliable detection.
 * Returns undefined during SSR, then resolves on mount.
 */
export function useMobileDetect() {
  const [isMobile, setIsMobile] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    function check() {
      const width = window.innerWidth;
      const ua = navigator.userAgent;
      const isMobileUA = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      const isNarrow = width < 768;
      // Standalone PWA mode
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);

      setIsMobile(isMobileUA || isNarrow || isStandalone);
    }

    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isMobile;
}

/**
 * Returns true if the app is running in standalone PWA mode.
 */
export function useIsStandalone() {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);
    setIsStandalone(standalone);
  }, []);

  return isStandalone;
}
