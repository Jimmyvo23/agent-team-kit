import { useState } from 'react';
import { useTeamState } from './api';
import { Building } from './components/Building';
import { Clipboard } from './components/Clipboard';

export function App() {
  const { state, error } = useTeamState();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!state) {
    return (
      <main className="scene">
        <div className="scene-message">
          {error ? (
            <>
              <h1>The office cannot open</h1>
              <p>{error.error}</p>
              <p>{error.hint}</p>
            </>
          ) : <p>Opening the office</p>}
        </div>
      </main>
    );
  }

  const pending = state.approvals.filter((a) => a.state === 'pending');
  const selected = state.agents.find((a) => a.id === selectedId) ?? null;

  return (
    <main className="scene">
      <div className="cloud" aria-hidden="true" />
      <div className="cloud cloud-far" aria-hidden="true" />
      <div className="office">
        <Building
          project={state.project}
          agents={state.agents}
          selectedId={selected?.id ?? null}
          pendingApprovals={pending.length}
          onSelect={setSelectedId}
        />
        <Clipboard
          agent={selected}
          events={selected ? state.agentLogs[selected.id] ?? [] : []}
          pendingApprovals={pending}
          now={state.updatedAt}
        />
      </div>
    </main>
  );
}
