import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthUser, authApi, sessionStore } from '../lib/apiClient';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    const existing = sessionStore.load();
    if (!existing) {
      setStatus('unauthenticated');
    } else {
      authApi
        .me()
        .then((me) => {
          if (cancelled) return;
          setUser({ ...existing.user, ...me });
          setStatus('authenticated');
        })
        .catch(() => {
          if (cancelled) return;
          sessionStore.clear();
          setStatus('unauthenticated');
        });
    }

    const unsubscribe = sessionStore.subscribe((s) => {
      if (!s) {
        setUser(null);
        setStatus('unauthenticated');
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    const session = await authApi.login(email, password);
    sessionStore.save(session, remember);
    setUser(session.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* session may already be invalid */
    }
    sessionStore.clear();
  }, []);

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
