import type { AgentState } from './types';

/**
 * Room order in the DOM: team.json order with the approver moved to the end of the top row,
 * so the top-right corner office comes in reading and focus order where it is drawn.
 */
export function orderRooms<A extends Pick<AgentState, 'isApprover'>>(agents: A[], columns: number): A[] {
  const approver = agents.find((a) => a.isApprover);
  if (!approver) return agents;
  const others = agents.filter((a) => a !== approver);
  const at = Math.min(columns - 1, others.length);
  return [...others.slice(0, at), approver, ...others.slice(at)];
}
