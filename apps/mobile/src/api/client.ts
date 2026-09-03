/**
 * Network layer for the field app.
 *
 * Everything here can fail — that is the normal case at a camp — so callers
 * are expected to treat a rejection as "try again later", never as an error to
 * show the user mid-consultation.
 */

import { transport } from './transport';

const REFRESH_KEY = 'mgms.camp.refresh';
const SESSION_KEY = 'mgms.camp.session';

export interface CampSession {
  id: string;
  username: string;
  fullName: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
  scope: { level: string; campIds: string[] };
  loginTime: string;
}

let accessToken: string | null = null;

export class ApiError extends Error {
  constructor(readonly status: number, override readonly message: string, readonly details?: unknown) {
    super(message);
  }
}

export class OfflineError extends Error {
  constructor() {
    super('No connection');
  }
}

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage refused; the session just will not survive a reload.
  }
}

export function cachedSession(): CampSession | null {
  return readStored<CampSession>(SESSION_KEY);
}

export function hasRefreshToken(): boolean {
  return readStored<string>(REFRESH_KEY) != null;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Omit<CampSession, 'loginTime'>;
}

function adopt(auth: AuthResponse): CampSession {
  accessToken = auth.accessToken;
  writeStored(REFRESH_KEY, auth.refreshToken);
  const session: CampSession = { ...auth.user, loginTime: new Date().toISOString() };
  writeStored(SESSION_KEY, session);
  return session;
}

export async function login(username: string, password: string, deviceId: string): Promise<CampSession> {
  const res = await transport('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, deviceId }),
  }).catch(() => {
    throw new OfflineError();
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? 'Sign-in failed');
  return adopt(data as AuthResponse);
}

/**
 * Exchange the stored refresh token for a fresh access token.
 *
 * A camp device signs in once at the start of a duty shift and may not see the
 * network again for hours, so this is expected to fail offline — the caller
 * keeps the cached session and carries on working from the outbox.
 */
let refreshInFlight: Promise<CampSession | null> | null = null;

/**
 * Refresh tokens are single-use, so two concurrent refreshes would race: one
 * succeeds and the other is told the token is invalid, which would sign a camp
 * out in the middle of a shift. Every caller shares one attempt.
 */
export function refreshAccess(deviceId: string): Promise<CampSession | null> {
  refreshInFlight ??= performRefresh(deviceId).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function performRefresh(deviceId: string): Promise<CampSession | null> {
  const refreshToken = readStored<string>(REFRESH_KEY);
  if (!refreshToken) return null;

  const res = await transport('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken, deviceId }),
  }).catch(() => {
    throw new OfflineError();
  });

  if (!res.ok) {
    // Only a definitive rejection clears the credential; a 5xx might be a
    // proxy at the venue and must not sign the camp out.
    if (res.status === 401 || res.status === 403) {
      writeStored(REFRESH_KEY, null);
      writeStored(SESSION_KEY, null);
    }
    return null;
  }
  return adopt((await res.json()) as AuthResponse);
}

export function signOutLocally() {
  accessToken = null;
  writeStored(REFRESH_KEY, null);
  writeStored(SESSION_KEY, null);
}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; deviceId: string },
): Promise<T> {
  const send = () =>
    transport(`/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    }).catch(() => {
      throw new OfflineError();
    });

  let res = await send();
  if (res.status === 401) {
    const session = await refreshAccess(options.deviceId);
    if (!session) throw new ApiError(401, 'Session expired — sign in again when you have a connection');
    res = await send();
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (data as { error?: { message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, error?.message ?? `Request failed (${res.status})`, error?.details);
  }
  return data as T;
}
