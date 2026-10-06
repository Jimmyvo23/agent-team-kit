// @ts-check
/**
 * Log rotation. When events.jsonl grows past a size threshold it is renamed to a
 * dated archive next to it, and a fresh log starts with one `snapshot` event
 * holding the folded state of the archive, so the dashboard state is unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';
import { appendEvent, readEvents } from './events.mjs';
import { foldEvents } from './state.mjs';

/** @typedef {import('./team.mjs').Team} Team */

export const DEFAULT_MAX_BYTES = 5_000_000;

/**
 * Rotate the log if it is larger than `maxBytes`.
 *
 * The snapshot state is built before the rename, so a read or fold failure
 * leaves the log untouched. readEvents warnings on the archive are dropped on
 * purpose; the server reports warnings when it reads the live log.
 *
 * Known limitation: a hook that appends after the state is built but before the
 * rename ends up in the archive only, and one that lands between the rename and
 * the snapshot write sits before the snapshot and is superseded by it. Either
 * way that event is not in the new state. Accepted for a local prototype.
 *
 * @param {string} logPath path to events.jsonl
 * @param {Team} team
 * @param {Date} now
 * @param {number} [maxBytes]
 * @returns {{ rotated: boolean, archivePath?: string }}
 */
export function rotateIfNeeded(logPath, team, now, maxBytes = DEFAULT_MAX_BYTES) {
  let size;
  try {
    size = fs.statSync(logPath).size;
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') return { rotated: false };
    throw err;
  }
  if (size <= maxBytes) return { rotated: false };

  const dir = path.dirname(logPath);
  const date = now.toISOString().slice(0, 10);
  let archivePath = path.join(dir, `events-${date}.jsonl`);
  for (let n = 2; fs.existsSync(archivePath); n++) archivePath = path.join(dir, `events-${date}-${n}.jsonl`);

  const state = foldEvents(readEvents(logPath).events, team);
  fs.renameSync(logPath, archivePath);
  appendEvent(logPath, { type: 'snapshot', source: 'server', state }, now);
  return { rotated: true, archivePath };
}
