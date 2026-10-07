import type { AgentStatus } from '../types';

interface FigureProps {
  status: AgentStatus;
  /** Desk computer; the approver's corner office has none. */
  screen?: boolean;
}

/**
 * Stick figure at a desk. Motion is driven by the room's state class in office.css:
 * typing arms when working, a raised waving hand when waiting, steam over the mug on a break.
 */
export function Figure({ status, screen = true }: FigureProps) {
  const waiting = status === 'awaiting_approval';
  return (
    <svg className="figure" width="90" height="74" viewBox="0 0 90 74" fill="none" aria-hidden="true">
      {screen && (
        <g className="figure-screen">
          <rect x="54" y="30" width="20" height="15" rx="2" className="fill-ink" stroke="none" />
          <rect x="56" y="32" width="16" height="11" className="fill-sky" stroke="none" />
        </g>
      )}
      <circle cx="40" cy="15" r="8" className="fill-paper" />
      <line x1="40" y1="23" x2="40" y2="48" />
      <line className="arm-left" x1="40" y1="34" x2="28" y2="46" />
      {waiting
        ? <line className="arm-right" x1="40" y1="34" x2="52" y2="14" />
        : <line className="arm-right" x1="40" y1="34" x2="54" y2="46" />}
      <line x1="40" y1="48" x2="33" y2="62" />
      <line x1="40" y1="48" x2="47" y2="62" />
      <rect x="14" y="50" width="66" height="6" rx="2" className="fill-wood" strokeWidth="2" />
      {status === 'idle' && (
        <g className="mug">
          <rect x="64" y="44" width="8" height="8" rx="2" className="fill-paper" strokeWidth="1.5" />
          <path className="steam" d="M66 42 q2 -4 0 -8" strokeWidth="1.5" />
          <path className="steam steam-late" d="M70 42 q2 -4 0 -8" strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}
