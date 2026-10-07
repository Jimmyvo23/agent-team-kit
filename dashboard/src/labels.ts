import type { AgentState, AgentStatus } from './types';

/** The only wording the UI uses for agent states. */
export const STATE_LABELS: Record<AgentStatus, string> = {
  working: 'Working',
  idle: 'On a break',
  blocked: 'Stuck',
  awaiting_approval: 'Waiting for approval',
  done: 'Finished',
};

export const NOTHING_ASSIGNED = 'Nothing assigned';

/** Accessible name of a room: "<name>: <label>, <currentTask>". */
export function roomLabel(agent: AgentState): string {
  const task = agent.currentTask ?? NOTHING_ASSIGNED.toLowerCase();
  return `${agent.name}: ${STATE_LABELS[agent.status]}, ${task}`;
}

/** Milliseconds from `from` to `to` (ISO strings), never negative. */
function elapsedMs(from: string, to: string): number {
  return Math.max(0, Date.parse(to) - Date.parse(from));
}

/** Whole minutes from `from` to `to`. */
export function minutesBetween(from: string, to: string): number {
  return Math.floor(elapsedMs(from, to) / 60_000);
}

/** "N seconds ago", "N min ago", "N hours ago" relative to the server clock `now`. */
export function ago(from: string, now: string): string {
  const seconds = Math.floor(elapsedMs(from, now) / 1000);
  if (seconds < 60) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'} ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
}

/** The stale warning, from the server's `stale` flag. Null when the agent is not stale. */
export function staleWarning(agent: AgentState, now: string): string | null {
  if (!agent.stale || agent.updatedAt === null) return null;
  return `Last update ${minutesBetween(agent.updatedAt, now)} min ago`;
}

const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Wall-clock time of an event, like 14:03. */
export function clockTime(iso: string): string {
  return clock.format(new Date(iso));
}
