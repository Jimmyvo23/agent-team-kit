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

/** Poll GET /api/team. The next request starts `intervalMs` after the previous one finishes. */
export function useTeamState(intervalMs = POLL_INTERVAL_MS): TeamStateResult {
  const [result, setResult] = useState<TeamStateResult>({ state: null, error: null, offline: false });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let stopped = false;

    async function poll() {
      controller = new AbortController();
      try {
        const res = await fetch('/api/team', { cache: 'no-store', signal: controller.signal });
        const body: unknown = await res.json().catch(() => null);
        if (stopped) return;
        if (res.ok) setResult({ state: body as TeamState, error: null, offline: false });
        else setResult((prev) => ({ state: prev.state, error: asTeamError(body, res.status), offline: false }));
      } catch {
        if (stopped) return;
        setResult((prev) => ({ ...prev, offline: true }));
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
