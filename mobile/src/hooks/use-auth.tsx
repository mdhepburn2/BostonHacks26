import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import * as authApi from '@/api/auth';
import { ApiError, setAuthToken, setUnauthorizedHandler } from '@/api/client';
import type { User } from '@/api/types';
import { getItem, removeItem, setItem } from '@/utils/login-storage';

const TOKEN_KEY = 'auth.token';
const USER_KEY = 'auth.user';

export type AuthState = {
  /** 'loading' only while reading the saved login at startup. */
  status: 'loading' | 'signedIn' | 'signedOut';
  user: User | null;
  login: (credentials: authApi.Credentials) => Promise<void>;
  register: (input: authApi.Credentials & { email?: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * Keeps the login (token + user) in secure storage (localStorage on web) and hands the token to
 * the API client. Wrap the app in this once, in the root layout.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUser] = useState<User | null>(null);

  const signIn = async (token: string, next: User) => {
    setAuthToken(token);
    setUser(next);
    setStatus('signedIn');
    await Promise.all([
      setItem(TOKEN_KEY, token),
      setItem(USER_KEY, JSON.stringify(next)),
    ]).catch(() => {});
  };

  const logout = async () => {
    setAuthToken(null);
    setUser(null);
    setStatus('signedOut');
    await Promise.all([
      removeItem(TOKEN_KEY),
      removeItem(USER_KEY),
    ]).catch(() => {});
  };

  // Restore the saved login at startup, then check it's still good in the background.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [token, savedUser] = await Promise.all([
        getItem(TOKEN_KEY),
        getItem(USER_KEY),
      ]).catch(() => [null, null]);
      if (cancelled) return;
      if (!token || !savedUser) {
        setStatus('signedOut');
        return;
      }
      setAuthToken(token);
      setUser(JSON.parse(savedUser) as User);
      setStatus('signedIn');

      try {
        const fresh = await authApi.getMe();
        if (!cancelled) setUser(fresh);
      } catch (err) {
        // A 401 logs out through the handler below; offline just keeps the saved user.
        if (!(err instanceof ApiError)) throw err;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The server rejected our token: log out so screens show the login prompt.
  useEffect(() => {
    setUnauthorizedHandler(() => void logout());
    return () => setUnauthorizedHandler(null);
  });

  const value: AuthState = {
    status,
    user,
    login: async (credentials) => {
      const res = await authApi.login(credentials);
      await signIn(res.token, res.user);
    },
    register: async (input) => {
      const res = await authApi.register(input);
      await signIn(res.token, res.user);
    },
    logout,
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const auth = use(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>.');
  return auth;
}
