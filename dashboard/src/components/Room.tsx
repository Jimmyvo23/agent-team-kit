import type { CSSProperties, KeyboardEvent } from 'react';
import type { AgentState } from '../types';
import { roomLabel, STATE_LABELS } from '../labels';
import { Figure } from './Figure';

export interface RoomProps {
  agent: AgentState;
  selected: boolean;
  /** Number of pending approvals; draws one sheet per approval in the approver's in-tray. */
  traySheets?: number;
  /** id of the preview card while it is shown, for aria-describedby. */
  describedBy?: string;
  /** Replaces the state wording on the door plaque (Task 14 uses it for "New from <sender>"). */
  plaque?: string;
  onSelect: (id: string) => void;
}

/** The tray stops growing after this many sheets; the clipboard lists them all. */
export const MAX_TRAY_SHEETS = 8;

const BUBBLES: Partial<Record<AgentState['status'], string>> = { blocked: '!', awaiting_approval: '?' };

/** One office room, painted in the agent's colour. Its lights and figure show the state. */
export function Room({ agent, selected, traySheets = 0, describedBy, plaque, onSelect }: RoomProps) {
  const bubble = BUBBLES[agent.status];

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(agent.id);
    }
  }

  return (
    <div
      className={`room state-${agent.status}`}
      style={{ '--wall': agent.color } as CSSProperties}
      role="button"
      tabIndex={0}
      aria-label={roomLabel(agent)}
      aria-pressed={selected}
      aria-describedby={describedBy}
      data-agent={agent.id}
      onClick={() => onSelect(agent.id)}
      onKeyDown={onKeyDown}
    >
      <div className="room-window" />
      <div className="room-lamp" />
      <div className="room-glow" />
      {bubble && <div className="room-bubble">{bubble}</div>}
      <Figure status={agent.status} screen={!agent.isApprover} />
      {agent.isApprover && (
        <div className="room-tray">
          {Array.from({ length: Math.min(traySheets, MAX_TRAY_SHEETS) }, (_, i) => (
            <i key={i} data-testid="tray-sheet" style={{ top: `${-4 - i * 4}px` }} />
          ))}
        </div>
      )}
      <div className="room-door" />
      <div className="room-plaque">{plaque ?? STATE_LABELS[agent.status]}</div>
      <div className="room-name">{agent.name}</div>
    </div>
  );
}
