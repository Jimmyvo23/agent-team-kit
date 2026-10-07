import type { TeamState } from '../types';
import { agentName, NOTHING_ASSIGNED, needsYouLine, STATE_LABELS, TASK_COLUMNS } from '../labels';

const APPROVAL_LABELS = {
  pending: 'Waiting for a decision',
  approved: 'Approved',
  rejected: 'Rejected',
  changes_requested: 'Changes requested',
} as const;

/** Plain-text office: who is doing what, the tasks, and the approvals. */
export function ListView({ state }: { state: TeamState }) {
  const { agents, tasks, approvals, needsYou } = state;
  const approver = agents.find((a) => a.isApprover);
  return (
    <section className="list-view" aria-label="List view">
      <h1>{`${state.project} team`}</h1>
      {approver && needsYou.length > 0 && (
        <>
          <h2>Needs {approver.name}</h2>
          <ul>
            {needsYou.map((item) => {
              const line = needsYouLine(item, agents);
              return <li key={`${item.kind}-${item.id}`}><strong>{line.title}</strong>. {line.detail}</li>;
            })}
          </ul>
        </>
      )}
      <h2>Team</h2>
      <ul>
        {agents.map((a) => (
          <li key={a.id}>
            <strong>{a.name}</strong> {`${STATE_LABELS[a.status]}, ${a.currentTask ?? NOTHING_ASSIGNED.toLowerCase()}`}
            {a.status === 'blocked' && a.reason && <>. {a.reason}</>}
          </li>
        ))}
      </ul>
      <h2>Tasks</h2>
      {tasks.length === 0 ? <p>No tasks yet.</p> : TASK_COLUMNS.map(({ state: s, label }) => {
        const column = tasks.filter((t) => t.state === s);
        if (column.length === 0) return null;
        return (
          <div key={s}>
            <h3>{`${label} (${column.length})`}</h3>
            <ul>
              {column.map((t) => <li key={t.id}><strong>{t.id}</strong> {t.title}, {agentName(agents, t.owner)}</li>)}
            </ul>
          </div>
        );
      })}
      <h2>Approvals</h2>
      {approvals.length === 0 ? <p>No approvals yet.</p> : (
        <ul>
          {approvals.map((ap) => (
            <li key={ap.id}><strong>{ap.id}</strong> {APPROVAL_LABELS[ap.state]}. {ap.summary}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
