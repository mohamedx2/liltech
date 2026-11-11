'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { env } from '@/config/env';
import { api, ApiClientError } from '@/lib/api';
import type { AuthUser, LoginRequest } from '@/lib/api/contracts/pending';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  errorMessage: string | null;
  isMockMode: boolean;
  login: (credentials: LoginRequest) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMockMode = env.NEXT_PUBLIC_API_MODE === 'mock';

  const refreshSession = useCallback(async () => {
    setStatus('loading');
    setErrorMessage(null);
    try {
      const result = await api.auth.getSession();
      if (result.user) {
        setUser(result.user);
        setStatus('authenticated');
      } else {
        setUser(null);
        setStatus('unauthenticated');
      }
    } catch (error: unknown) {
      if (error instanceof ApiClientError) {
        // 401 or 404 (planned auth module not yet live on backend) leaves the visitor unauthenticated cleanly
        if (error.status === 401 || error.status === 404 || error.status === 501) {
          setUser(null);
          setStatus('unauthenticated');
          return;
        }
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Unable to verify session status.');
      }
      setUser(null);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (credentials: LoginRequest): Promise<AuthUser> => {
    setErrorMessage(null);
    const result = await api.auth.login(credentials);
    setUser(result.user);
    setStatus('authenticated');
    return result.user;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.auth.logout();
    } catch (error: unknown) {
      // Clear local UI state even if session was already expired or endpoint unavailable
      if (!(error instanceof ApiClientError) || (error.status !== 401 && error.status !== 404)) {
        throw error;
      }
    } finally {
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      errorMessage,
      isMockMode,
      login,
      logout,
      refreshSession,
    }),
    [status, user, errorMessage, isMockMode, login, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return ctx;
}
