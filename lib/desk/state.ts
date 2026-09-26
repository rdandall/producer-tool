export type Zone = "desk" | "waiting" | "later" | "done" | "pending" | "deleted";
export type ChecklistItem = { id: string; text: string; done: boolean };
export type Card = { notes?: string; dueDate?: string; checklist?: ChecklistItem[]; link?: string; id: string; title: string; project: string; detail: string; color: string; zone: Zone; x: number; y: number; remaining?: number; arranged?: boolean };
export type DeskPreferences = { cardSize: "compact" | "large"; placement: "side" | "center"; movement: "studio" | "float" };
export type DeskState = { cards: Card[]; preferences: DeskPreferences };
export type CloudDesk = { revision: string | null; data: DeskState };
export const emptyDesk: DeskState = { cards: [], preferences: { cardSize: "large", placement: "side", movement: "studio" } };
export const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// The discard countdown belongs to one device. Only its final outcome syncs.
export function durableDesk(data: DeskState): DeskState {
  return { ...data, cards: data.cards.map((card) => {
    const saved = { ...card, zone: card.zone === "pending" ? "desk" as const : card.zone };
    delete saved.remaining;
    return saved;
  }) };
}

export function validDesk(value: unknown): value is DeskState {
  if (!value || typeof value !== "object") return false;
  const { cards, preferences } = value as DeskState;
  if (!preferences || !["compact", "large"].includes(preferences.cardSize) || !["side", "center"].includes(preferences.placement) || !["studio", "float"].includes(preferences.movement)) return false;
  if (!Array.isArray(cards) || cards.length > 2000) return false;
  const ids = new Set<string>();
  return cards.every((c) => {
    if (!c || typeof c !== "object" || typeof c.id !== "string" || !c.id || c.id.length > 100 || ids.has(c.id)) return false;
    ids.add(c.id);
    if (!["title", "project", "detail", "color"].every((key) => typeof c[key as keyof Card] === "string" && (c[key as keyof Card] as string).length <= 5000)) return false;
    if (!["desk", "waiting", "later", "done", "deleted"].includes(c.zone) || !Number.isFinite(c.x) || !Number.isFinite(c.y) || c.x < 0 || c.x > 1 || c.y < 0 || c.y > 1) return false;
    if (!["notes", "dueDate", "link"].every((key) => c[key as keyof Card] === undefined || (typeof c[key as keyof Card] === "string" && (c[key as keyof Card] as string).length <= 50000))) return false;
    if (c.arranged !== undefined && typeof c.arranged !== "boolean") return false;
    if (c.checklist !== undefined) {
      if (!Array.isArray(c.checklist) || c.checklist.length > 500) return false;
      const steps = new Set<string>();
      if (!c.checklist.every((item) => {
        if (!item || typeof item.id !== "string" || !item.id || item.id.length > 100 || steps.has(item.id) || typeof item.text !== "string" || item.text.length > 5000 || typeof item.done !== "boolean") return false;
        steps.add(item.id); return true;
      })) return false;
    }
    return true;
  });
}

function mergeFields<T extends object>(base: T | undefined, local: T, remote: T): T {
  const result = { ...remote };
  for (const key of Object.keys(local) as Array<keyof T>) {
    if (!equal(local[key], base?.[key])) result[key] = local[key];
  }
  return result;
}

// Preserve edits to different cards/fields made on two devices. Concurrent edits
// to the same field use the last successful save; deleted cards remain recoverable.
export function mergeDesk(base: DeskState, local: DeskState, remote: DeskState): DeskState {
  const cards = new Map(remote.cards.map((card) => [card.id, card]));
  for (const card of local.cards) {
    const before = base.cards.find((item) => item.id === card.id);
    const other = cards.get(card.id);
    if (!other) { if (!before || !equal(before, card)) cards.set(card.id, card); continue; }
    const merged = mergeFields(before, card, other);
    if (!equal(before?.checklist, card.checklist)) {
      const steps = new Map((other.checklist ?? []).map((item) => [item.id, item]));
      for (const old of before?.checklist ?? []) {
        if (!(card.checklist ?? []).some((item) => item.id === old.id)) steps.delete(old.id);
      }
      for (const item of card.checklist ?? []) {
        const old = before?.checklist?.find((step) => step.id === item.id);
        const current = steps.get(item.id);
        if (current) steps.set(item.id, mergeFields(old, item, current));
        else if (!old || !equal(old, item)) steps.set(item.id, item);
      }
      merged.checklist = [...steps.values()];
    }
    cards.set(card.id, merged);
  }
  return { cards: [...cards.values()], preferences: mergeFields(base.preferences, local.preferences, remote.preferences) };
}
