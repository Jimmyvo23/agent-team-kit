// @ts-check
/** The instant the busy fixture was written for. Tests and the dashboard UI run on this clock. */
export const FIXTURE_NOW = '2026-10-05T10:10:00.000Z';

/**
 * A clock that starts at FIXTURE_NOW and then ticks in real time.
 * @returns {() => Date}
 */
export function fixtureClock() {
  const startedAt = Date.now();
  return () => new Date(Date.parse(FIXTURE_NOW) + (Date.now() - startedAt));
}
