/**
 * API client.
 *
 * Holds the access token in memory only — a token in localStorage is readable
 * by any script on the page. The refresh token is the long-lived credential and
 * is the only thing persisted, so a reload restores the session without keeping
 * a usable bearer token on disk.
 */

const REFRESH_KEY = 'mgms.refresh';

export interface Session {
  id: string;
  username: string;
  fullName: string;
  roleCode: string;
  roleName: string;
  scopeLevel: string;
  permissions: string[];
  scope: {
    level: string;
    campIds: string[];
    districtIds: string[];
    regionIds: string[];
    facilityIds: string[];
    departmentIds: string[];
  };
}

let accessToken: string | null = null;
let currentSession: Session | null = null;
let onSessionLost: (() => void) | null = null;

export function setSessionLostHandler(handler: () => void) {
  onSessionLost = handler;
}

export function getSession(): Session | null {
  return currentSession;
}

export function storedRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function persistRefresh(token: string | null) {
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {
    // Private browsing: the session simply will not survive a reload.
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    override readonly message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Session;
}

function adopt(auth: AuthResponse): Session {
  accessToken = auth.accessToken;
  currentSession = auth.user;
  persistRefresh(auth.refreshToken);
  return auth.user;
}

export async function login(username: string, password: string): Promise<Session> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? 'Sign-in failed');
  return adopt(data as AuthResponse);
}

/** Restore a session from the persisted refresh token, e.g. after a reload. */
export async function restoreSession(): Promise<Session | null> {
  const refreshToken = storedRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    persistRefresh(null);
    return null;
  }
  return adopt((await res.json()) as AuthResponse);
}

export async function logout(): Promise<void> {
  const refreshToken = storedRefreshToken();
  if (refreshToken) {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  accessToken = null;
  currentSession = null;
  persistRefresh(null);
}

let refreshInFlight: Promise<Session | null> | null = null;

/** Refresh once even if several requests hit a 401 at the same moment. */
function refreshOnce(): Promise<Session | null> {
  refreshInFlight ??= restoreSession().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal; raw?: boolean } = {},
): Promise<T> {
  const send = async () =>
    fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

  let res = await send();

  // An expired access token is recoverable: refresh and replay once.
  if (res.status === 401 && storedRefreshToken()) {
    const session = await refreshOnce();
    if (session) {
      res = await send();
    } else {
      onSessionLost?.();
      throw new ApiError(401, 'Your session has expired. Please sign in again.');
    }
  }

  if (options.raw) {
    if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`);
    return (await res.text()) as T;
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (data as { error?: { message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, error?.message ?? `Request failed (${res.status})`, error?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  text: (path: string) => request<string>(path, { raw: true }),
};
