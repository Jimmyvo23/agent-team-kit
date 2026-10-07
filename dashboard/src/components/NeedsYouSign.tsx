import type { AgentState, NeedsYouItem } from '../types';
import { needsYouLine, needsYouTitle } from '../labels';

export interface NeedsYouSignProps {
  approver: AgentState;
  items: NeedsYouItem[];
  agents: AgentState[];
  /** Pins the approver's clipboard. */
  onOpen: () => void;
}

/** The sign that hangs from the roof while anything needs the approver. Renders nothing otherwise. */
export function NeedsYouSign({ approver, items, agents, onOpen }: NeedsYouSignProps) {
  if (items.length === 0) return null;
  const first = needsYouLine(items[0], agents);
  return (
    // Keyed on the count so the sign sways again when something new arrives.
    <button key={items.length} type="button" className="needs-sign" onClick={onOpen}>
      <strong>{needsYouTitle(approver.name, items.length)}</strong>
      <span className="needs-sign-summary">{first.title}</span>
    </button>
  );
}
