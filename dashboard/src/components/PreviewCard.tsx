import type { AgentState } from '../types';
import { NOTHING_ASSIGNED, STATE_LABELS } from '../labels';

/** Short hover preview of a room: name, state, task, progress. */
export function PreviewCard({ agent, id }: { agent: AgentState; id: string }) {
  const showProgress = !agent.isApprover && agent.currentTask !== null;
  return (
    <div className="preview" role="tooltip" id={id}>
      <div className="preview-head">
        <strong>{agent.name}</strong>
        <span className={`state-pill state-${agent.status}`}>{STATE_LABELS[agent.status]}</span>
      </div>
      <div className="preview-task">{agent.currentTask ?? NOTHING_ASSIGNED}</div>
      {showProgress && (
        <div className="preview-progress">
          <div className="meter meter-small" aria-hidden="true">
            <div style={{ width: `${agent.progress}%`, background: agent.status === 'blocked' ? 'var(--alert)' : agent.color }} />
          </div>
          <span>{agent.progress}%</span>
        </div>
      )}
    </div>
  );
}
