// @ts-check
/**
 * Turns the event log into the TeamState the office dashboard renders.
 * foldEvents = reducer (plain JSON, no derived fields; this is what a snapshot stores).
 * buildState = derive(foldEvents(...)).
 */

/** @typedef {import('./team.mjs').Team} Team */
/** @typedef {{ id: string, status: string, currentTask: string|null, progress: number, nextStep: string|null, reason: string|null, lastAction: string|null, updatedAt: string|null, stoppedAtProgress: number|null }} RawAgent */
/** @typedef {{ id: string, requestedBy: string, summary: string, state: string, requestedAt: string, decidedAt: string|null, note: string, agents: string[] }} Approval */
/** @typedef {{ id: string, title: string, owner: string, state: string, notes: string }} Task */
/**
 * @typedef {object} Folded
 * @property {RawAgent[]} agents touched agents (members and visitors), first-seen order
 * @property {Approval[]} approvals
 * @property {Task[]} tasks
 * @property {{ time: string, agent: string, event: string }[]} log
 * @property {Record<string, { time: string, event: string }[]>} agentLogs
 * @property {{ from: string, to: string, task: string, time: string }[]} handoffs
 * @property {{ task: string, summary: string }[]} escalations open escalations
 */

export const LOG_CAP = 100;
export const AGENT_LOG_CAP = 20;
export const HANDOFF_CAP = 20;
export const VISITOR_COLOR = '#d9d9e3';
const TEAM_ID = 'team';

/** @param {unknown} v */
const norm = (v) => String(v ?? '').trim().toLowerCase();

/** @returns {Folded} */
function emptyFolded() {
  return { agents: [], approvals: [], tasks: [], log: [], agentLogs: {}, handoffs: [], escalations: [] };
}

/**
 * Human-readable log line for an event (the only place wording lives).
 * @param {Record<string, any>} e
 * @returns {string}
 */
function describe(e) {
  switch (e.type) {
    case 'agent_start': return e.task ? `Started ${e.task}` : 'Started';
    case 'agent_stop': return 'Finished';
    case 'tool_use': return String(e.action);
    case 'status': {
      if (e.status === 'blocked') return `Stuck: ${e.reason}`;
      if (e.status === 'done') return 'Finished';
      if (e.status === 'idle') return 'Took a break';
      if (e.status === 'awaiting_approval') return 'Waiting for approval';
      const on = e.task ? ` on ${e.task}` : '';
      return e.progress === undefined ? `Working${on}` : `Working${on}, ${e.progress}%`;
    }
    case 'task': return `Task ${e.id} is ${String(e.state).replace('_', ' ')}`;
    case 'approval_requested': return `Asked for approval: ${e.summary}`;
    case 'approval_decided': return `Approval ${e.id} ${String(e.state).replace('_', ' ')}`;
    case 'handoff': return `Handed ${e.task} to ${norm(e.to)}`;
    case 'escalation': return `Escalated ${e.task}: ${e.summary}`;
    default: return String(e.type);
  }
}

/**
 * Fold events (in file order) into the accumulated state.
 * @param {Record<string, any>[]} events
 * @param {Team} team
 * @returns {Folded}
 */
export function foldEvents(events, team) {
  const approverId = team.approver.id;
  /** @type {Folded} */
  let acc = emptyFolded();

  /** @param {string} id @returns {RawAgent} */
  const ensure = (id) => {
    let a = acc.agents.find((x) => x.id === id);
    if (!a) {
      a = { id, status: 'idle', currentTask: null, progress: 0, nextStep: null, reason: null,
        lastAction: null, updatedAt: null, stoppedAtProgress: null };
      acc.agents.push(a);
    }
    return a;
  };

  /**
   * Record a log line for an agent (updates its updatedAt, except the approver and "team").
   * @param {string} id @param {string} time @param {string} line
   * @returns {RawAgent|null} the desk agent, if it has one
   */
  const touch = (id, time, line) => {
    acc.log.push({ time, agent: id, event: line });
    if (acc.log.length > LOG_CAP) acc.log.splice(0, acc.log.length - LOG_CAP);
    if (id === TEAM_ID) return null;
    const list = (acc.agentLogs[id] ??= []);
    list.push({ time, event: line });
    if (list.length > AGENT_LOG_CAP) list.splice(0, list.length - AGENT_LOG_CAP);
    if (id === approverId) return null;
    const a = ensure(id);
    a.updatedAt = time;
    return a;
  };

  for (const e of events) {
    if (e.type === 'snapshot') {
      acc = { ...emptyFolded(), ...structuredClone(e.state) };
      continue;
    }
    const time = e.time;
    const line = describe(e);
    const who = norm(e.agent);
    switch (e.type) {
      case 'agent_start': {
        const a = touch(who, time, line);
        if (a) {
          a.status = 'working';
          a.currentTask = e.task ?? a.currentTask;
          a.stoppedAtProgress = null;
        }
        break;
      }
      case 'agent_stop': {
        const a = touch(who, time, line);
        if (a) {
          a.status = 'done';
          a.stoppedAtProgress = a.progress < 100 ? a.progress : null;
        }
        break;
      }
      case 'tool_use': {
        const a = touch(who, time, line);
        if (a) {
          a.lastAction = e.action;
          if (a.status === 'idle' || a.status === 'done') a.status = 'working';
        }
        break;
      }
      case 'status': {
        const a = touch(who, time, line);
        if (a) {
          a.status = e.status;
          if (e.task !== undefined) a.currentTask = e.task;
          if (e.progress !== undefined) a.progress = e.progress;
          if (e.nextStep !== undefined) a.nextStep = e.nextStep;
          if (e.reason !== undefined) a.reason = e.reason;
          else if (e.status !== 'blocked') a.reason = null;
        }
        break;
      }
      case 'task': {
        touch(who || 'planner', time, line);
        const task = { id: e.id, title: e.title, owner: norm(e.owner), state: e.state, notes: e.notes ?? '' };
        const i = acc.tasks.findIndex((t) => t.id === task.id);
        if (i >= 0) acc.tasks[i] = task; else acc.tasks.push(task);
        acc.escalations = acc.escalations.filter((x) => x.task !== task.id);
        if (task.state === 'done') {
          const owner = acc.agents.find((x) => x.id === task.owner);
          if (owner && owner.status === 'done') {
            owner.status = 'idle';
            owner.updatedAt = time;
          }
        }
        break;
      }
      case 'approval_requested': {
        const requestedBy = norm(e.agent) || 'planner';
        touch(requestedBy, time, line);
        const agents = (Array.isArray(e.agents) ? e.agents : []).map(norm).filter((id) => id && id !== TEAM_ID);
        const approval = { id: e.id, requestedBy, summary: e.summary, state: 'pending', requestedAt: time,
          decidedAt: null, note: '', agents };
        const i = acc.approvals.findIndex((x) => x.id === approval.id);
        if (i >= 0) acc.approvals[i] = approval; else acc.approvals.push(approval);
        for (const id of agents) {
          if (id === approverId) continue;
          const a = ensure(id);
          if (a.status !== 'working' && a.status !== 'blocked') { a.status = 'awaiting_approval'; a.updatedAt = time; }
        }
        break;
      }
      case 'approval_decided': {
        touch(norm(e.agent) || 'planner', time, line);
        const ap = acc.approvals.find((x) => x.id === e.id);
        if (!ap) break;
        ap.state = e.state;
        ap.decidedAt = time;
        ap.note = e.note ?? '';
        for (const id of ap.agents) {
          const a = acc.agents.find((x) => x.id === id);
          const stillWaiting = acc.approvals.some((x) => x.state === 'pending' && x.agents.includes(id));
          if (a && a.status === 'awaiting_approval' && !stillWaiting) { a.status = 'idle'; a.updatedAt = time; }
        }
        break;
      }
      case 'handoff': {
        touch(norm(e.from), time, line);
        acc.handoffs.push({ from: norm(e.from), to: norm(e.to), task: e.task, time });
        if (acc.handoffs.length > HANDOFF_CAP) acc.handoffs.splice(0, acc.handoffs.length - HANDOFF_CAP);
        break;
      }
      case 'escalation': {
        touch(who || 'planner', time, line);
        acc.escalations = acc.escalations.filter((x) => x.task !== e.task);
        acc.escalations.push({ task: e.task, summary: e.summary });
        break;
      }
      default:
    }
  }
  return acc;
}

/**
 * Derive the dashboard state from accumulated state.
 * @param {Folded} acc
 * @param {Team} team
 * @param {Date} now
 */
export function derive(acc, team, now) {
  /** @param {string} id */
  const raw = (id) => acc.agents.find((a) => a.id === id);
  const pending = acc.approvals.filter((a) => a.state === 'pending');
  const staleMs = team.staleAfterMinutes * 60_000;

  /** @param {{ id: string, name: string, role: string, color: string }} m @param {boolean} visitor */
  const deskAgent = (m, visitor) => {
    const r = raw(m.id);
    const status = r?.status ?? 'idle';
    const updatedAt = r?.updatedAt ?? null;
    return {
      id: m.id, name: m.name, role: m.role, color: m.color, status,
      currentTask: r?.currentTask ?? null,
      progress: r?.progress ?? 0,
      nextStep: r?.nextStep ?? null,
      reason: r?.reason ?? null,
      lastAction: r?.lastAction ?? null,
      updatedAt,
      stale: status === 'working' && updatedAt !== null && now.getTime() - Date.parse(updatedAt) > staleMs,
      stoppedAtProgress: r?.stoppedAtProgress ?? null,
      isApprover: false,
      isVisitor: visitor,
    };
  };

  const known = new Set([team.approver.id, ...team.members.map((m) => m.id)]);
  const agents = [
    ...team.members.map((m) => deskAgent(m, false)),
    {
      ...deskAgent(team.approver, false),
      status: pending.length > 0 ? 'awaiting_approval' : 'idle',
      currentTask: pending.length === 0 ? null : `${pending.length} ${pending.length === 1 ? 'decision' : 'decisions'} waiting`,
      updatedAt: acc.approvals.flatMap((a) => [a.requestedAt, a.decidedAt]).filter((t) => t !== null)
        .reduce((best, t) => (best === null || Date.parse(t) > Date.parse(best) ? t : best), /** @type {string|null} */ (null)),
      isApprover: true,
    },
    ...acc.agents.filter((a) => !known.has(a.id))
      .map((a) => deskAgent({ id: a.id, name: a.id, role: 'Visitor', color: VISITOR_COLOR }, true)),
  ];

  /** @type {{ kind: 'approval'|'blocked'|'escalation', id: string, summary: string }[]} */
  const needsYou = [
    ...pending.map((a) => /** @type {const} */ ({ kind: 'approval', id: a.id, summary: a.summary })),
    ...acc.agents.filter((a) => a.status === 'blocked')
      .map((a) => /** @type {const} */ ({ kind: 'blocked', id: a.id, summary: a.reason ?? '' })),
    ...acc.escalations.map((x) => /** @type {const} */ ({ kind: 'escalation', id: x.task, summary: x.summary })),
  ];

  return {
    updatedAt: now.toISOString(),
    project: team.project,
    agents,
    approvals: acc.approvals,
    tasks: acc.tasks,
    log: acc.log,
    agentLogs: acc.agentLogs,
    needsYou,
    handoffs: acc.handoffs,
  };
}

/**
 * @param {Record<string, any>[]} events validated events in file order
 * @param {Team} team
 * @param {Date} now
 */
export function buildState(events, team, now) {
  return derive(foldEvents(events, team), team, now);
}
