import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SyncBundle, SyncPushResponse } from '@mgms/shared';
import { OfflineError, apiFetch, cachedSession, hasRefreshToken, login, refreshAccess, signOutLocally, type CampSession } from '../api/client';
import { STORES, idb, requestPersistence } from '../db/idb';
import { allEntries, markEntry, pendingEntries, pruneSent, toSyncOperation, updateWalkIn, type OutboxEntry } from '../db/queue';

const DEVICE_KEY = 'mgms.camp.device';

/** A stable per-device id, part of the capture metadata on every record. */
function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `WEB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export interface SyncState {
  session: CampSession | null;
  status: 'loading' | 'signed-in' | 'signed-out';
  online: boolean;
  deviceId: string;
  bundle: SyncBundle | null;
  pendingCount: number;
  rejectedCount: number;
  lastSyncAt: string | null;
  syncing: boolean;
  syncError: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
  sync: () => Promise<void>;
  refreshBundle: () => Promise<void>;
  reloadCounts: () => Promise<void>;
}

const SyncContext = createContext<SyncState | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const device = useMemo(deviceId, []);
  const [session, setSession] = useState<CampSession | null>(cachedSession());
  const [status, setStatus] = useState<SyncState['status']>('loading');
  const [online, setOnline] = useState(navigator.onLine);
  const [bundle, setBundle] = useState<SyncBundle | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncInFlight = useRef(false);
  // Set when a sync is asked for while one is already running, so the request
  // is honoured after the current pass instead of being dropped.
  const syncRequested = useRef(false);

  const reloadCounts = useCallback(async () => {
    const entries = await allEntries();
    setPendingCount(entries.filter((e) => e.status === 'PENDING' || e.status === 'SENDING').length);
    setRejectedCount(entries.filter((e) => e.status === 'REJECTED').length);
  }, []);

  // Restore whatever the device already holds before touching the network, so
  // the app is usable within a second of launch even with no signal.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await requestPersistence();
      const [cachedBundle, storedLastSync] = await Promise.all([
        idb.get<SyncBundle>(STORES.bundle, 'current'),
        idb.get<string>(STORES.meta, 'lastSyncAt'),
      ]);
      if (cancelled) return;

      if (cachedBundle) setBundle(cachedBundle);
      if (storedLastSync) setLastSyncAt(storedLastSync);
      await reloadCounts();

      const cached = cachedSession();
      if (cached) {
        setSession(cached);
        setStatus('signed-in');
        // Refreshing the access token is best-effort; failing it offline must
        // not sign a camp out mid-shift.
        refreshAccess(device).catch(() => undefined);
      } else {
        setStatus(hasRefreshToken() ? 'signed-in' : 'signed-out');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [device, reloadCounts]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const refreshBundle = useCallback(async () => {
    // Read through to the persisted session as well: immediately after
    // sign-in the React state has not yet been committed, and the bundle
    // pull would otherwise be skipped on exactly the pass that needs it.
    const campId = session?.scope.campIds[0] ?? cachedSession()?.scope.campIds[0];
    if (!campId) return;
    const fresh = await apiFetch<SyncBundle>(`/sync/pull?campId=${campId}`, { deviceId: device });
    await idb.put(STORES.bundle, fresh, 'current');
    setBundle(fresh);
  }, [session, device]);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    if (syncInFlight.current) {
      syncRequested.current = true;
      return;
    }
    syncInFlight.current = true;
    setSyncing(true);
    setSyncError(null);

    try {
      const entries = await pendingEntries();

      if (entries.length > 0) {
        // Resolve dependent legs against registrations already acknowledged in
        // an earlier batch, so a vitals record queued yesterday still lands.
        const resolved: OutboxEntry[] = [];
        for (const entry of entries) {
          if (entry.kind !== 'REGISTRATION' && !entry.walkInId && entry.walkInClientId) {
            const inBatch = entries.some(
              (e) => e.kind === 'REGISTRATION' && e.clientId === entry.walkInClientId,
            );
            if (!inBatch) {
              const walkIn = await idb.get<{ serverId?: string }>(STORES.walkIns, entry.walkInClientId);
              if (walkIn?.serverId) entry.walkInId = walkIn.serverId;
            }
          }
          resolved.push(entry);
          await markEntry(entry.clientId, { status: 'SENDING' });
        }

        const response = await apiFetch<SyncPushResponse>('/sync/push', {
          method: 'POST',
          deviceId: device,
          body: {
            deviceId: device,
            appVersion: '1.0.0',
            operations: resolved.map(toSyncOperation),
          },
        });

        for (const result of response.results) {
          const entry = resolved.find((e) => e.clientId === result.clientId);
          if (result.status === 'APPLIED' || result.status === 'DUPLICATE') {
            await markEntry(result.clientId, { status: 'SENT' });
            if (entry?.kind === 'REGISTRATION' && result.walkInId) {
              await updateWalkIn(entry.clientId, {
                serverId: result.walkInId,
                tokenNumber: result.tokenNumber,
                synced: true,
              });
            } else if (entry?.walkInClientId) {
              await updateWalkIn(entry.walkInClientId, { synced: true });
            }
          } else {
            // A rejected record stays on the device for a human to look at;
            // silently dropping a patient record is never acceptable.
            await markEntry(result.clientId, {
              status: 'REJECTED',
              lastError: result.message ?? 'Rejected by the server',
            });
          }
        }
        await pruneSent();
      }

      await refreshBundle();
      const now = new Date().toISOString();
      await idb.put(STORES.meta, now, 'lastSyncAt');
      setLastSyncAt(now);
    } catch (error) {
      setSyncError(
        error instanceof OfflineError
          ? 'No connection — records are queued on this device'
          : error instanceof Error
            ? error.message
            : 'Sync failed',
      );
      // Anything left mid-flight goes back to PENDING for the next attempt.
      for (const entry of await allEntries()) {
        if (entry.status === 'SENDING') await markEntry(entry.clientId, { status: 'PENDING' });
      }
    } finally {
      await reloadCounts();
      setSyncing(false);
      syncInFlight.current = false;

      if (syncRequested.current) {
        syncRequested.current = false;
        void sync();
      }
    }
    // `sync` refers to itself for the trailing re-run above; the ref guard
    // makes that safe and bounded — one extra pass, never a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, refreshBundle, reloadCounts]);

  // Sync when the connection returns and on a slow heartbeat while it holds.
  useEffect(() => {
    if (status !== 'signed-in') return;
    if (online) void sync();
    const timer = setInterval(() => {
      if (navigator.onLine) void sync();
    }, 120_000);
    return () => clearInterval(timer);
  }, [online, status, sync]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const next = await login(username, password, device);
      setSession(next);
      setStatus('signed-in');
      await sync();
    },
    [device, sync],
  );

  const signOut = useCallback(() => {
    signOutLocally();
    setSession(null);
    setStatus('signed-out');
  }, []);

  const value = useMemo<SyncState>(
    () => ({
      session,
      status,
      online,
      deviceId: device,
      bundle,
      pendingCount,
      rejectedCount,
      lastSyncAt,
      syncing,
      syncError,
      signIn,
      signOut,
      sync,
      refreshBundle,
      reloadCounts,
    }),
    [session, status, online, device, bundle, pendingCount, rejectedCount, lastSyncAt, syncing, syncError, signIn, signOut, sync, refreshBundle, reloadCounts],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncState {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSync must be used inside a SyncProvider');
  return context;
}
