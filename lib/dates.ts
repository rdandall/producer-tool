/**
 * Centralised date formatting utilities for PRDCR.
 *
 * Rules:
 *  - "Today" / "Tomorrow" / "Yesterday" for ±1 day
 *  - "Mon"–"Sun" for the rest of the current week
 *  - "Jan 15" for dates within the current year
 *  - "Jan 15, 2025" for dates in other years
 */

/* ── helpers ────────────────────────────────────── */

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDate(dateStr: string) {
  // Supabase dates come as "YYYY-MM-DD" (no time zone) — parse as local
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(dateStr);
}

/* ── public API ─────────────────────────────────── */

/** Smart display date: Today / Tomorrow / Yesterday / Mon / Jan 15 / Jan 15, 2025 */
export function formatDate(dateStr: string): string {
  const d = parseDate(dateStr);
  const today = startOfDay(new Date());
  const target = startOfDay(d);
  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";

  // Same week (next 6 days forward)
  if (diffDays >= 2 && diffDays <= 6) {
    return d.toLocaleDateString("en-US", { weekday: "short" });
  }

  // Same year → "Jan 15"
  if (d.getFullYear() === today.getFullYear()) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Other year → "Jan 15, 2025"
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Short date without smart relative words: always "Jan 15" or "Jan 15, 2025" */
export function shortDate(dateStr: string): string {
  const d = parseDate(dateStr);
  const today = new Date();

  if (d.getFullYear() === today.getFullYear()) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Relative countdown label + overdue flag.
 * Returns { label, overdue } — e.g. "3d", "Today", "Overdue", "2d overdue"
 */
export function daysUntil(dateStr: string): { label: string; overdue: boolean } {
  const target = startOfDay(parseDate(dateStr));
  const today = startOfDay(new Date());
  const diff = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diff < -1) return { label: `${Math.abs(diff)}d overdue`, overdue: true };
  if (diff === -1) return { label: "1d overdue", overdue: true };
  if (diff === 0) return { label: "Today", overdue: false };
  if (diff === 1) return { label: "Tomorrow", overdue: false };
  return { label: `${diff}d`, overdue: false };
}

/** True when the date is strictly before today */
export function isOverdue(dateStr: string): boolean {
  return startOfDay(parseDate(dateStr)) < startOfDay(new Date());
}

/** Full date for dashboard greeting: "Monday, February 25" */
export function formatGreetingDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
