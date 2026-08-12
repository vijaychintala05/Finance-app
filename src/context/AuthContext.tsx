import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';

interface AuthUser { id: string; email: string; fullName: string }
interface RegistrationInput {
  email: string;
  password: string;
  fullName: string;
  organizationName: string;
  country: string;
  baseCurrency: string;
}
interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login(email: string, password: string): Promise<boolean>;
  register(input: RegistrationInput): Promise<boolean>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function storeSession(token?: string, organizationId?: string): void {
  if (token && !import.meta.env.PROD) localStorage.setItem('auth_token', token);
  else localStorage.removeItem('auth_token');
  localStorage.setItem('firmbooks_authenticated', 'true');
  if (organizationId) localStorage.setItem('active_organization_id', organizationId);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (import.meta.env.PROD) localStorage.removeItem('auth_token');
    apiClient.get<{ user: AuthUser; organizations: Array<{ id: string }> }>('/auth/me').then((response) => {
      if (!active) return;
      if (response.data?.user) {
        localStorage.setItem('firmbooks_authenticated', 'true');
        setUser(response.data.user);
        const stored = localStorage.getItem('active_organization_id');
        const permitted = response.data.organizations.some((org) => org.id === stored);
        if (!permitted && response.data.organizations[0]?.id) {
          localStorage.setItem('active_organization_id', response.data.organizations[0].id);
        }
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setError(null);
    const response = await apiClient.post<{ user: AuthUser; token?: string }>('/auth/login', { email, password });
    if (!response.data) {
      setError(response.error || 'Login failed');
      return false;
    }
    storeSession(response.data.token);
    const profile = await apiClient.get<{ user: AuthUser; organizations: Array<{ id: string }> }>('/auth/me');
    if (!profile.data) {
      localStorage.removeItem('auth_token');
      setError(profile.error || 'Could not load account');
      return false;
    }
    if (profile.data.organizations[0]?.id) localStorage.setItem('active_organization_id', profile.data.organizations[0].id);
    setUser(profile.data.user);
    return true;
  };

  const register = async (input: RegistrationInput): Promise<boolean> => {
    setError(null);
    const response = await apiClient.post<{ user: AuthUser; token?: string; organizationId: string }>('/auth/register', input);
    if (!response.data) {
      setError(response.error || 'Registration failed');
      return false;
    }
    storeSession(response.data.token, response.data.organizationId);
    setUser(response.data.user);
    return true;
  };

  const logout = async (): Promise<void> => {
    await apiClient.post('/auth/logout');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('active_organization_id');
    localStorage.removeItem('firmbooks_authenticated');
    setUser(null);
  };

  const value = useMemo(() => ({ user, loading, error, login, register, logout }), [user, loading, error]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
