import type { LocalWalkIn } from '../db/queue';
import { useSync } from '../sync/SyncProvider';

/** The camp's own home screen: who is on shift, what is queued, what is stuck. */
export function HomeScreen({
  walkIns,
  onNew,
  onWaiting,
  onOpen,
}: {
  walkIns: LocalWalkIn[];
  onNew: () => void;
  onWaiting: () => void;
  onOpen: (walkIn: LocalWalkIn) => void;
}) {
  const { session, bundle, pendingCount, rejectedCount, lastSyncAt, sync, syncing, online, syncError } = useSync();

  const camp = bundle?.camp as { name?: string; code?: string } | undefined;
  const today = new Date().toDateString();
  const registeredToday = walkIns.filter((w) => new Date(w.registeredAt).toDateString() === today);
  const waiting = walkIns.filter((w) => w.stage === 'REGISTERED' || w.stage === 'VITALS_DONE');
  const critical = waiting.filter((w) => w.triageLevel === 'RED');

  return (
    <>
      <div className="step-head">
        <div className="step-num">{camp?.code ?? 'Camp'}</div>
        <h2 className="step-title">{camp?.name ?? 'Medical camp'}</h2>
        <div className="step-hint">
          {session?.fullName} · {session?.roleName}
        </div>
      </div>

      {critical.length > 0 && (
        <div className="banner err">
          <strong>{critical.length} critical patient(s) waiting.</strong> Call 108 and alert the coordinator.
        </div>
      )}

      {rejectedCount > 0 && (
        <div className="banner warn">
          <strong>{rejectedCount} record(s) were rejected by the server.</strong> Show this device to your supervisor —
          the records are still stored here and have not been lost.
        </div>
      )}

      {!bundle && (
        <div className="banner warn">
          No offline data has been downloaded yet. Connect once and sync so this camp can work without a network.
        </div>
      )}

      <div className="card">
        <h3>Today</h3>
        <div className="rows">
          <div className="rowline"><span className="k">Registered on this device</span><span className="v mono">{registeredToday.length}</span></div>
          <div className="rowline"><span className="k">Waiting</span><span className="v mono">{waiting.length}</span></div>
          <div className="rowline"><span className="k">Queued to send</span><span className="v mono">{pendingCount}</span></div>
          <div className="rowline">
            <span className="k">Last sync</span>
            <span className="v">{lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : 'never'}</span>
          </div>
        </div>

        <button
          type="button"
          className="btn block"
          style={{ marginTop: 12 }}
          onClick={() => void sync()}
          disabled={syncing || !online}
        >
          {syncing ? 'Syncing…' : online ? 'Sync now' : 'Offline — will sync automatically'}
        </button>
        {syncError && <p className="small muted" style={{ marginTop: 8 }}>{syncError}</p>}
      </div>

      <button type="button" className="btn primary block" onClick={onNew} style={{ marginBottom: 10 }}>
        Register a new walk-in
      </button>
      <button type="button" className="btn block" onClick={onWaiting}>
        Waiting patients ({waiting.length})
      </button>

      {walkIns.length > 0 && (
        <>
          <h3 style={{ margin: '22px 0 10px', fontSize: 15 }}>Recent</h3>
          {walkIns.slice(0, 6).map((walkIn) => (
            <button key={walkIn.clientId} type="button" className="queue-item" onClick={() => onOpen(walkIn)}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="who">{walkIn.name}</span>
                <span className="token" style={{ display: 'block' }}>
                  {walkIn.tokenNumber ?? 'token on sync'} · {new Date(walkIn.registeredAt).toLocaleTimeString()}
                </span>
              </span>
              {!walkIn.synced && <span className="pill grey">queued</span>}
              <span aria-hidden>›</span>
            </button>
          ))}
        </>
      )}
    </>
  );
}
