import type { LocalWalkIn } from '../db/queue';

const STAGE_LABEL: Record<string, string> = {
  REGISTERED: 'Awaiting vitals',
  VITALS_DONE: 'Awaiting the medical officer',
  CLINICAL_DONE: 'Awaiting pharmacy',
  DISPENSED: 'Complete',
  REFERRED: 'Referred',
  CLOSED: 'Closed',
};

function triageClass(level?: string) {
  return level === 'RED' ? 'red' : level === 'ORANGE' ? 'orange' : level === 'YELLOW' ? 'amber' : 'green';
}

/**
 * "Waiting Pts." — the walk-ins already registered on this device but not yet
 * seen. Ordered by triage first, then by arrival: a red case that arrived last
 * must not sit behind a queue of green ones.
 */
export function WaitingListScreen({
  walkIns,
  onOpen,
  onNew,
}: {
  walkIns: LocalWalkIn[];
  onOpen: (walkIn: LocalWalkIn) => void;
  onNew: () => void;
}) {
  const rank: Record<string, number> = { RED: 0, ORANGE: 1, YELLOW: 2, GREEN: 3 };
  const waiting = walkIns
    .filter((w) => w.stage === 'REGISTERED' || w.stage === 'VITALS_DONE')
    .sort((a, b) => {
      const byTriage = (rank[a.triageLevel ?? 'GREEN'] ?? 3) - (rank[b.triageLevel ?? 'GREEN'] ?? 3);
      return byTriage !== 0 ? byTriage : a.registeredAt.localeCompare(b.registeredAt);
    });

  return (
    <>
      <div className="step-head">
        <div className="step-num">Queue</div>
        <h2 className="step-title">Waiting patients</h2>
        <div className="step-hint">{waiting.length} waiting · most urgent first</div>
      </div>

      {waiting.length === 0 ? (
        <div className="empty">
          <p>Nobody is waiting.</p>
          <button type="button" className="btn primary" onClick={onNew} style={{ marginTop: 12 }}>
            Register a walk-in
          </button>
        </div>
      ) : (
        waiting.map((walkIn) => (
          <button key={walkIn.clientId} type="button" className="queue-item" onClick={() => onOpen(walkIn)}>
            <span className={`pill ${triageClass(walkIn.triageLevel)}`}>{walkIn.triageLevel ?? 'GREEN'}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="who">{walkIn.name}</span>
              <span className="token" style={{ display: 'block' }}>
                {walkIn.ageYears} y · {walkIn.gender.toLowerCase()} · {walkIn.tokenNumber ?? 'token on sync'}
              </span>
              <span className="small muted">{STAGE_LABEL[walkIn.stage] ?? walkIn.stage}</span>
            </span>
            {!walkIn.synced && <span className="pill grey">queued</span>}
            <span aria-hidden>›</span>
          </button>
        ))
      )}
    </>
  );
}
