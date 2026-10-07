import type { ReactNode } from 'react';
import type { AgentLogEntry, AgentState, Approval } from '../types';
import { ago, clockTime, NOTHING_ASSIGNED, staleWarning, STATE_LABELS } from '../labels';

export const CLIPBOARD_EVENTS = 20;

export interface ClipboardProps {
  /** The pinned agent, or null when nothing is pinned yet. */
  agent: AgentState | null;
  /** That agent's log, oldest first (state.agentLogs[agent.id]). */
  events: AgentLogEntry[];
  /** Pending approvals, listed on the approver's clipboard. */
  pendingApprovals: Approval[];
  /** Server clock (state.updatedAt); every relative time is measured against it. */
  now: string;
  /** Extra content under the details (Task 14: everything that needs Jimmy). */
  children?: ReactNode;
}

/** The clipboard on the right: details of the pinned agent. */
export function Clipboard({ agent, events, pendingApprovals, now, children }: ClipboardProps) {
  return (
    <aside className="clipboard" aria-label="Details">
      {agent ? <AgentDetails agent={agent} events={events} pendingApprovals={pendingApprovals} now={now} /> : (
        <p className="clipboard-empty">Pick a room to pin what that person is doing here.</p>
      )}
      {children}
    </aside>
  );
}

type AgentDetailsProps = Omit<ClipboardProps, 'children' | 'agent'> & { agent: AgentState };

function AgentDetails({ agent: a, events, pendingApprovals, now }: AgentDetailsProps) {
  const stale = staleWarning(a, now);
  const recent = events.slice(-CLIPBOARD_EVENTS).reverse();
  const fill = a.status === 'blocked' ? 'var(--alert)' : a.color;

  return (
    <>
      <div aria-live="polite">
        <h2 className="clipboard-name">{a.name}</h2>
        <p className="clipboard-role">{a.role}</p>
        <span className={`state-pill state-${a.status}`}>{STATE_LABELS[a.status]}</span>
      </div>
      {stale && <p className="clipboard-stale">{stale}</p>}
      <dl className="clipboard-facts">
        <dt>{a.isApprover ? 'On your desk' : 'Working on'}</dt>
        <dd>{a.currentTask ?? NOTHING_ASSIGNED}</dd>
        {a.status === 'blocked' && a.reason && (
          <>
            <dt>Why it is stuck</dt>
            <dd>{a.reason}</dd>
          </>
        )}
        {a.isApprover ? (
          pendingApprovals.length > 0 && (
            <>
              <dt>Waiting for your decision</dt>
              <dd>
                <ul className="clipboard-approvals">
                  {pendingApprovals.map((ap) => (
                    <li key={ap.id}><strong>{ap.id}</strong> {ap.summary}</li>
                  ))}
                </ul>
              </dd>
            </>
          )
        ) : (
          <>
            <dt id={`progress-${a.id}`}>Progress</dt>
            <dd>
              {a.progress}%
              <div
                className="meter"
                role="progressbar"
                aria-labelledby={`progress-${a.id}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={a.progress}
              >
                <div style={{ width: `${a.progress}%`, background: fill }} />
              </div>
              {a.stoppedAtProgress !== null && <span className="clipboard-note">Stopped at {a.stoppedAtProgress}%</span>}
            </dd>
            <dt>Next step</dt>
            <dd>{a.nextStep ?? 'Not set yet'}</dd>
          </>
        )}
      </dl>
      <div className="clipboard-history">
        <h3>Recent activity</h3>
        {recent.length === 0 ? <p className="clipboard-quiet">Nothing yet.</p> : (
          <ol>
            {recent.map((e, i) => (
              <li key={`${e.time}-${i}`}><time dateTime={e.time}>{clockTime(e.time)}</time>{e.event}</li>
            ))}
          </ol>
        )}
        <p className="clipboard-updated">{a.updatedAt ? `Updated ${ago(a.updatedAt, now)}` : 'No updates yet'}</p>
      </div>
    </>
  );
}
