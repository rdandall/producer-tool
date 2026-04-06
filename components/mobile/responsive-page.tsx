"use client";

import { useMobileDetect } from "@/hooks/use-mobile-detect";

interface ResponsivePageProps {
  desktop: React.ReactNode;
  mobile: React.ReactNode;
}

/**
 * Renders mobile or desktop variant based on device detection.
 * Returns null during SSR hydration (brief flash handled by splash screen).
 */
export function ResponsivePage({ desktop, mobile }: ResponsivePageProps) {
  const isMobile = useMobileDetect();

  if (isMobile === undefined) return null;
  return <>{isMobile ? mobile : desktop}</>;
}
