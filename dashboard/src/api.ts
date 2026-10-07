import { useEffect, useState } from 'react';
import type { TeamError, TeamState } from './types';

export const POLL_INTERVAL_MS = 3000;

export interface TeamStateResult {
  /** Last good state. Kept while offline or while team.json is broken, so the office does not blank out. */
  state: TeamState | null;
  /** Set when the server answered with an error (for example an invalid team.json). */
  error: TeamError | null;
  /** True when the last request could not reach the server. */
  offline: boolean;
}

function asTeamError(body: unknown, status: number): TeamError {
  const b = (body ?? {}) as Partial<TeamError>;
  return {
    error: typeof b.error === 'string' ? b.error : `The office server answered with status ${status}.`,
    hint: typeof b.hint === 'string' ? b.hint : 'Check the terminal that runs the office server.',
  };
}

/** A 200 answer is only used when it looks like a TeamState. */
function isTeamState(body: unknown): body is TeamState {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return false;
  const b = body as Partial<TeamState>;
  return typeof b.project === 'string' && Array.isArray(b.agents) && Array.isArray(b.tasks)
    && Array.isArray(b.approvals) && Array.isArray(b.needsYou) && Array.isArray(b.handoffs);
}

export const UNREADABLE: TeamError = {
  error: 'The office server sent an answer the page could not read.',
  hint: 'Restart the office server, then reload this page.',
};

/**
 * Poll GET /api/team. The next request starts `intervalMs` after the previous one finishes.
 * A request that takes longer than two intervals is aborted and counts as offline.
 */
export function useTeamState(intervalMs = POLL_INTERVAL_MS): TeamStateResult {
  const [result, setResult] = useState<TeamStateResult>({ state: null, error: null, offline: false });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let stopped = false;

    async function poll() {
      controller = new AbortController();
      const hung = setTimeout(() => controller?.abort(), intervalMs * 2);
      try {
        const res = await fetch('/api/team', { cache: 'no-store', signal: controller.signal });
        const body: unknown = await res.json().catch(() => null);
        if (stopped) return;
        // Timed out while reading the body: that is a hung server, not a bad answer.
        if (controller.signal.aborted) throw new Error('timed out');
        if (res.ok && isTeamState(body)) setResult({ state: body, error: null, offline: false });
        else if (res.ok) setResult((prev) => ({ state: prev.state, error: UNREADABLE, offline: false }));
        else setResult((prev) => ({ state: prev.state, error: asTeamError(body, res.status), offline: false }));
      } catch {
        if (stopped) return;
        setResult((prev) => ({ ...prev, offline: true }));
      } finally {
        clearTimeout(hung);
      }
      if (!stopped) timer = setTimeout(poll, intervalMs);
    }

    void poll();
    return () => {
      stopped = true;
      controller?.abort();
      clearTimeout(timer);
    };
  }, [intervalMs]);

  return result;
}
