import { useState, type ReactNode } from 'react';
import type { AgentState } from '../types';
import { Room } from './Room';
import { PreviewCard } from './PreviewCard';

export interface BuildingProps {
  project: string;
  agents: AgentState[];
  selectedId: string | null;
  pendingApprovals: number;
  onSelect: (id: string) => void;
  /** Per-agent plaque overrides (Task 14: "New from <sender>"). */
  plaques?: Record<string, string>;
  /** Hangs above the roof (Task 14: needs-you sign). */
  sign?: ReactNode;
  /** Runs along the ceiling over the rooms (Task 14: mail tube). */
  ceiling?: ReactNode;
  /** Ground floor under the rooms (Task 14: lobby task board). */
  lobby?: ReactNode;
}

/** The cutaway building: roof with the project name, then one room per agent. */
export function Building({ project, agents, selectedId, pendingApprovals, onSelect, plaques, sign, ceiling, lobby }: BuildingProps) {
  const [previewId, setPreviewId] = useState<string | null>(null);

  return (
    <section className="building" aria-label="Office">
      <div className="sign-slot">{sign}</div>
      <h1 className="roof">{`${project} team`}</h1>
      <div className="house">
        {ceiling}
        {agents.map((agent) => {
          const showPreview = previewId === agent.id;
          const cardId = `preview-${agent.id}`;
          return (
            <div
              key={agent.id}
              className={`room-slot${agent.isApprover ? ' room-slot-approver' : ''}${agent.id === selectedId ? ' is-selected' : ''}`}
              onMouseEnter={() => setPreviewId(agent.id)}
              onMouseLeave={() => setPreviewId((id) => (id === agent.id ? null : id))}
              onFocus={() => setPreviewId(agent.id)}
              onBlur={() => setPreviewId((id) => (id === agent.id ? null : id))}
              onKeyDown={(e) => { if (e.key === 'Escape') setPreviewId(null); }}
            >
              <Room
                agent={agent}
                selected={agent.id === selectedId}
                traySheets={agent.isApprover ? pendingApprovals : 0}
                describedBy={showPreview ? cardId : undefined}
                plaque={plaques?.[agent.id]}
                onSelect={onSelect}
              />
              {showPreview && <PreviewCard agent={agent} id={cardId} />}
            </div>
          );
        })}
      </div>
      {lobby}
    </section>
  );
}
