import type { TeamError } from '../types';
import { UNREADABLE } from '../api';

export interface StatusOverlayProps {
  error: TeamError | null;
  offline: boolean;
}

/**
 * Covers the office when the server cannot give a fresh state. The last good state stays
 * visible behind it. Renders nothing while everything is fine.
 */
export function StatusOverlay({ error, offline }: StatusOverlayProps) {
  if (!error && !offline) return null;
  return (
    <div className="status-overlay">
      {offline ? (
        <div className="status-card" role="status">
          <h2>Paused. Reconnecting…</h2>
          <p>The office server is not answering. This page keeps trying every few seconds.</p>
          <p className="status-hint">If you stopped it, start it again in the terminal.</p>
        </div>
      ) : error && (
        <div className="status-card status-card-problem" role="alert">
          <h2>{error === UNREADABLE ? 'The office cannot read the server' : 'The team file has a problem'}</h2>
          <p>{error.error}</p>
          <p className="status-hint">{error.hint}</p>
        </div>
      )}
    </div>
  );
}
