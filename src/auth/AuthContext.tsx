import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setAuthToken, setUnauthenticatedHandler } from '../api/client';
import type { Role, Session } from '../api/types';

const STORAGE_KEY = 'bloodlink.session';

interface AuthValue {
  session: Session | null;
  role: Role | null;
  signIn: (session: Session) => void;
  signOut: (notice?: string) => void;
  /** Shown on the sign-in screen, e.g. why the user was signed out. */
  notice: string | null;
}

const AuthContext = createContext<AuthValue | null>(null);

function readStoredSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    const stored = readStoredSession();
    // Set the token before any child screen makes its first call.
    setAuthToken(stored?.accessToken ?? null);
    return stored;
  });
  const [notice, setNotice] = useState<string | null>(null);

  const signIn = useCallback((next: Session) => {
    setAuthToken(next.accessToken);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable (private mode). The session still lasts for this tab.
    }
    setNotice(null);
    setSession(next);
  }, []);

  const signOut = useCallback((reason?: string) => {
    setAuthToken(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setNotice(reason ?? null);
    setSession(null);
  }, []);

  // Any 401 UNAUTHENTICATED from the service returns the user to sign-in.
  useEffect(() => {
    setUnauthenticatedHandler(() => signOut('Your session has ended. Sign in to continue.'));
    return () => setUnauthenticatedHandler(null);
  }, [signOut]);

  // Sign out when the token expires (8 hours after sign-in).
  useEffect(() => {
    if (!session) return;
    const ms = new Date(session.expiresAt).getTime() - Date.now();
    if (ms <= 0) return;
    const id = setTimeout(() => signOut('Your session expired. Sign in again.'), Math.min(ms, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [session, signOut]);

  const value = useMemo<AuthValue>(
    () => ({ session, role: session?.user.role ?? null, signIn, signOut, notice }),
    [session, signIn, signOut, notice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
