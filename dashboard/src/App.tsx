import { useEffect, useRef, useState } from 'react';
import { useTeamState } from './api';
import type { Handoff, TeamState } from './types';
import { agentName } from './labels';
import { Building } from './components/Building';
import { Clipboard } from './components/Clipboard';
import { Lobby } from './components/Lobby';
import { ListView } from './components/ListView';
import { MailTube, type Flight } from './components/MailTube';
import { NeedsYouSign } from './components/NeedsYouSign';
import { StatusOverlay } from './components/StatusOverlay';
import { ThemeToggle } from './components/ThemeToggle';

/** How long the receiver's plaque reads "New from <sender>". */
export const NEWS_MS = 4000;

/** Below this width the page opens in list view. */
const NARROW = '(max-width: 479px)';

const handoffKey = (h: Handoff) => `${h.from}|${h.to}|${h.task}|${h.time}`;

/**
 * Handoffs that were not in the first successful poll. Each one sends a folder down the
 * mail tube once and puts "New from <sender>" on the receiver's plaque for NEWS_MS.
 */
function useArrivals(state: TeamState | null): Flight[] {
  const seen = useRef<Set<string> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [arrivals, setArrivals] = useState<Flight[]>([]);

  useEffect(() => {
    if (!state) return;
    if (seen.current === null) {
      seen.current = new Set(state.handoffs.map(handoffKey));
      return;
    }
    const known = seen.current;
    const fresh = state.handoffs.filter((h) => !known.has(handoffKey(h)));
    if (fresh.length === 0) return;
    const flights = fresh.map((h) => ({ key: handoffKey(h), from: h.from, to: h.to }));
    for (const f of flights) {
      known.add(f.key);
      timers.current.push(setTimeout(() => setArrivals((list) => list.filter((x) => x.key !== f.key)), NEWS_MS));
    }
    setArrivals((list) => [...list, ...flights]);
  }, [state]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  return arrivals;
}

export function App() {
  const { state, error, offline } = useTeamState();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listView, setListView] = useState(() => window.matchMedia(NARROW).matches);
  const arrivals = useArrivals(state);

  const toolbar = (
    <div className="toolbar">
      <ThemeToggle />
      <button type="button" className="view-toggle" onClick={() => setListView((v) => !v)}>
        {listView ? 'Office view' : 'List view'}
      </button>
    </div>
  );

  if (!state) {
    return (
      <main className="scene">
        {toolbar}
        {!error && !offline && <p className="scene-opening">Opening the office</p>}
        <StatusOverlay error={error} offline={offline} />
      </main>
    );
  }

  const pending = state.approvals.filter((a) => a.state === 'pending');
  const selected = state.agents.find((a) => a.id === selectedId) ?? null;
  const approver = state.agents.find((a) => a.isApprover) ?? null;

  const plaques: Record<string, string> = {};
  for (const a of arrivals) plaques[a.to] = `New from ${agentName(state.agents, a.from)}`;
  const flight = arrivals.at(-1) ?? null;

  return (
    <main className="scene">
      <div className="cloud" aria-hidden="true" />
      <div className="cloud cloud-far" aria-hidden="true" />
      {toolbar}
      <div className="scene-body" inert={Boolean(error) || offline}>
        {listView ? <ListView state={state} /> : (
          <div className="office">
            <Building
              project={state.project}
              agents={state.agents}
              selectedId={selected?.id ?? null}
              pendingApprovals={pending.length}
              onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
              plaques={plaques}
              sign={approver && (
                <NeedsYouSign
                  approver={approver}
                  items={state.needsYou}
                  agents={state.agents}
                  onOpen={() => setSelectedId(approver.id)}
                />
              )}
              ceiling={<MailTube flight={flight} />}
              lobby={<Lobby tasks={state.tasks} agents={state.agents} />}
            />
            <Clipboard
              agent={selected}
              events={selected ? state.agentLogs[selected.id] ?? [] : []}
              needsYou={state.needsYou}
              agents={state.agents}
              now={state.updatedAt}
            />
          </div>
        )}
      </div>
      <StatusOverlay error={error} offline={offline} />
    </main>
  );
}
