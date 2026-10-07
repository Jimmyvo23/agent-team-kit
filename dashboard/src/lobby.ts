/** The lobby board shows at most this many tickets per column before "and N more". */
export const LOBBY_MAX = 3;

/** First `max` items of a column, and how many are left out. Never mutates `items`. */
export function capColumn<T>(items: T[], max = LOBBY_MAX): { shown: T[]; more: number } {
  const shown = items.slice(0, Math.max(0, max));
  return { shown, more: items.length - shown.length };
}
