import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSession, login as apiLogin, logout as apiLogout, restoreSession, setSessionLostHandler, type Session } from '../api/client';

interface AuthState {
  session: Session | null;
  status: 'loading' | 'signed-in' | 'signed-out';
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  can: (...permissions: string[]) => boolean;
  canAny: (...permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(getSession());
  const [status, setStatus] = useState<AuthState['status']>('loading');

  useEffect(() => {
    let cancelled = false;
    restoreSession()
      .then((restored) => {
        if (cancelled) return;
        setSession(restored);
        setStatus(restored ? 'signed-in' : 'signed-out');
      })
      .catch(() => {
        if (!cancelled) setStatus('signed-out');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // The client calls this when a refresh fails, so an expired session drops
    // the user to the sign-in screen instead of leaving a dead console up.
    setSessionLostHandler(() => {
      setSession(null);
      setStatus('signed-out');
    });
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const next = await apiLogin(username, password);
    setSession(next);
    setStatus('signed-in');
  }, []);

  const signOut = useCallback(async () => {
    await apiLogout();
    setSession(null);
    setStatus('signed-out');
  }, []);

  const value = useMemo<AuthState>(() => {
    const held = new Set(session?.permissions ?? []);
    return {
      session,
      status,
      signIn,
      signOut,
      can: (...permissions: string[]) => permissions.every((p) => held.has(p)),
      canAny: (...permissions: string[]) => permissions.some((p) => held.has(p)),
    };
  }, [session, status, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
