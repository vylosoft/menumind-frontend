const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || 'http://localhost:4000';
const SESSION_KEY = 'menumind_session_v1';

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix seconds
  user: AuthUser;
}

export class ApiError extends Error {
  status: number;
  invalid?: unknown;
  constructor(message: string, status: number, invalid?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.invalid = invalid;
  }
}

type SessionListener = (session: AuthSession | null) => void;
const listeners = new Set<SessionListener>();
let currentSession: AuthSession | null = null;
let refreshPromise: Promise<AuthSession | null> | null = null;

const storageFor = (remember: boolean) => (remember ? window.localStorage : window.sessionStorage);

export const sessionStore = {
  load(): AuthSession | null {
    if (currentSession) return currentSession;
    try {
      const raw = window.localStorage.getItem(SESSION_KEY) || window.sessionStorage.getItem(SESSION_KEY);
      currentSession = raw ? (JSON.parse(raw) as AuthSession) : null;
    } catch {
      currentSession = null;
    }
    return currentSession;
  },
  save(session: AuthSession, remember?: boolean) {
    const persistLocal = remember ?? Boolean(window.localStorage.getItem(SESSION_KEY));
    try {
      window.localStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem(SESSION_KEY);
      storageFor(persistLocal).setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      /* storage unavailable: keep in memory only */
    }
    currentSession = session;
    listeners.forEach((l) => l(session));
  },
  clear() {
    try {
      window.localStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    currentSession = null;
    listeners.forEach((l) => l(null));
  },
  subscribe(listener: SessionListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

const parseBody = async (res: Response) => {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const refreshSession = async (): Promise<AuthSession | null> => {
  const session = sessionStore.load();
  if (!session?.refreshToken) return null;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        });
        const body = await parseBody(res);
        if (!res.ok || !body?.data?.accessToken) {
          sessionStore.clear();
          return null;
        }
        sessionStore.save(body.data as AuthSession);
        return body.data as AuthSession;
      } catch {
        return null;
      } finally {
        setTimeout(() => {
          refreshPromise = null;
        }, 0);
      }
    })();
  }
  return refreshPromise;
};

const isExpiringSoon = (s: AuthSession) => !s.expiresAt || s.expiresAt * 1000 - Date.now() < 60_000;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  auth?: boolean;
  signal?: AbortSignal;
}

export async function apiRequest<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true, signal } = opts;

  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    });
  }

  const send = async (session: AuthSession | null) => {
    const headers: Record<string, string> = {};
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    if (auth && session) headers.Authorization = `Bearer ${session.accessToken}`;
    return fetch(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal,
    });
  };

  let session = auth ? sessionStore.load() : null;
  if (auth && session && isExpiringSoon(session)) session = (await refreshSession()) || session;

  let res: Response;
  try {
    res = await send(session);
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('Unable to reach the MenuMind API. Check your connection and try again.', 0);
  }

  if (res.status === 401 && auth && session) {
    const refreshed = await refreshSession();
    if (refreshed) res = await send(refreshed);
  }

  const payload = await parseBody(res);
  if (!res.ok) {
    if (res.status === 401 && auth) sessionStore.clear();
    throw new ApiError(payload?.message || `Request failed (${res.status})`, res.status, payload?.invalid);
  }
  return (payload?.data ?? payload) as T;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiRequest<AuthSession>('/api/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  me: () => apiRequest<AuthUser>('/api/auth/me'),
  logout: () => apiRequest('/api/auth/logout', { method: 'POST' }),
};

export { API_BASE_URL };
