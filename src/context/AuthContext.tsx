import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  sessionRevision: number;
  sessionTransitioning: boolean;
  loading: boolean;
  error: string | null;
  mfaRequired: boolean;
  login(email: string, password: string): Promise<boolean>;
  verifyMfa(code: string): Promise<boolean>;
  cancelMfa(): void;
  register(input: RegistrationInput): Promise<boolean>;
  logout(): Promise<void>;
  devLogin?(role?: string): Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function storeSession(token?: string, organizationId?: string): void {
  if (token) localStorage.setItem('auth_token', token);
  localStorage.setItem('firmbooks_authenticated', 'true');
  if (organizationId) localStorage.setItem('active_organization_id', organizationId);
}

function clearStoredSession(): void {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('active_organization_id');
  localStorage.removeItem('firmbooks_authenticated');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionRevision, setSessionRevision] = useState(0);
  const [sessionTransitioning, setSessionTransitioning] = useState(false);
  const authRequestEpochRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaTicket, setMfaTicket] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const requestedEpoch = authRequestEpochRef.current;
    const requestedToken = localStorage.getItem('auth_token');
    apiClient.get<{ user: AuthUser; organizations: Array<{ id: string }> }>('/auth/me').then(async (response) => {
      if (!active || authRequestEpochRef.current !== requestedEpoch || localStorage.getItem('auth_token') !== requestedToken) return;
      if (response.data?.user) {
        localStorage.setItem('firmbooks_authenticated', 'true');
        setUser(response.data.user);
        setSessionRevision((revision) => revision + 1);
        const stored = localStorage.getItem('active_organization_id');
        const permitted = response.data.organizations.some((org) => org.id === stored);
        if (!permitted && response.data.organizations[0]?.id) {
          localStorage.setItem('active_organization_id', response.data.organizations[0].id);
        }
        setLoading(false);
      } else {
        // A confirmed authorization failure means the stored bearer token can
        // no longer be used. Clear it so protected requests stop repeatedly
        // failing in the background and AuthGate can present sign-in.
        if (response.status === 401 || response.status === 403) {
          clearStoredSession();
          setUser(null);
        }
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    const requestEpoch = ++authRequestEpochRef.current;
    setSessionTransitioning(true);
    setError(null);
    const response = await apiClient.post<{
      user?: AuthUser;
      token?: string;
      mfaRequired?: boolean;
      mfaTicket?: string;
    }>('/auth/login', { email, password });

    if (requestEpoch !== authRequestEpochRef.current) return false;
    if (!response.data) {
      setSessionTransitioning(false);
      setError(response.error || 'Login failed');
      return false;
    }

    if (response.data.mfaRequired && response.data.mfaTicket) {
      setMfaRequired(true);
      setMfaTicket(response.data.mfaTicket);
      setSessionTransitioning(false);
      return true;
    }

    if (response.data.user) {
      const previouslyVerifiedToken = localStorage.getItem('auth_token');
      storeSession(response.data.token);
      const requestedToken = localStorage.getItem('auth_token');
      const profile = await apiClient.get<{ user: AuthUser; organizations: Array<{ id: string }> }>('/auth/me');
      if (requestEpoch !== authRequestEpochRef.current) return false;
      if (localStorage.getItem('auth_token') !== requestedToken || localStorage.getItem('firmbooks_authenticated') !== 'true') {
        if (localStorage.getItem('auth_token') === previouslyVerifiedToken) setSessionTransitioning(false);
        return false;
      }
      if (!profile.data?.user || profile.data.user.id !== response.data.user.id) {
        clearStoredSession();
        setError(profile.error || 'Could not load account');
        setUser(null);
        setSessionTransitioning(false);
        return false;
      }
      const organizations = Array.isArray(profile.data.organizations) ? profile.data.organizations : [];
      const storedOrgId = localStorage.getItem('active_organization_id');
      const verifiedOrgId = organizations.some((org) => org.id === storedOrgId) ? storedOrgId : organizations[0]?.id;
      if (verifiedOrgId) localStorage.setItem('active_organization_id', verifiedOrgId);
      else localStorage.removeItem('active_organization_id');
      setUser(profile.data.user);
      setSessionRevision((revision) => revision + 1);
      setSessionTransitioning(false);
      return true;
    }

    setSessionTransitioning(false);
    return false;
  };

  const verifyMfa = async (code: string): Promise<boolean> => {
    if (!mfaTicket) return false;
    const requestEpoch = ++authRequestEpochRef.current;
    setSessionTransitioning(true);
    setError(null);
    const response = await apiClient.post<{ user: AuthUser; token?: string }>('/auth/mfa/verify', {
      mfaTicket,
      mfaCode: code,
    });
    if (requestEpoch !== authRequestEpochRef.current) return false;
    if (!response.data) {
      setSessionTransitioning(false);
      setError(response.error || 'Invalid two-factor authentication code');
      return false;
    }
    storeSession(response.data.token);
    const requestedToken = localStorage.getItem('auth_token');
    const profile = await apiClient.get<{ user: AuthUser; organizations: Array<{ id: string }> }>('/auth/me');
    if (requestEpoch !== authRequestEpochRef.current || localStorage.getItem('auth_token') !== requestedToken || localStorage.getItem('firmbooks_authenticated') !== 'true') return false;
    if (!profile.data?.user || profile.data.user.id !== response.data.user.id) {
      clearStoredSession();
      setError(profile.error || 'Could not load account');
      setUser(null);
      setSessionTransitioning(false);
      return false;
    }
    const organizations = Array.isArray(profile.data.organizations) ? profile.data.organizations : [];
    const storedOrgId = localStorage.getItem('active_organization_id');
    const verifiedOrgId = organizations.some((org) => org.id === storedOrgId) ? storedOrgId : organizations[0]?.id;
    if (verifiedOrgId) localStorage.setItem('active_organization_id', verifiedOrgId);
    else localStorage.removeItem('active_organization_id');
    setUser(profile.data.user);
    setSessionRevision((revision) => revision + 1);
    setSessionTransitioning(false);
    setMfaRequired(false);
    setMfaTicket(null);
    return true;
  };

  const cancelMfa = (): void => {
    setMfaRequired(false);
    setMfaTicket(null);
    setError(null);
  };

  const register = async (input: RegistrationInput): Promise<boolean> => {
    const requestEpoch = ++authRequestEpochRef.current;
    setSessionTransitioning(true);
    setError(null);
    const response = await apiClient.post<{ user: AuthUser; token?: string; organizationId: string }>('/auth/register', input);
    if (requestEpoch !== authRequestEpochRef.current) return false;
    if (!response.data) {
      setSessionTransitioning(false);
      setError(response.error || 'Registration failed');
      return false;
    }
    storeSession(response.data.token, response.data.organizationId);
    const requestedToken = localStorage.getItem('auth_token');
    const profile = await apiClient.get<{ user: AuthUser; organizations: Array<{ id: string }> }>('/auth/me');
    if (requestEpoch !== authRequestEpochRef.current || localStorage.getItem('auth_token') !== requestedToken) return false;
    const organizations = Array.isArray(profile.data?.organizations) ? profile.data.organizations : [];
    if (!profile.data?.user || profile.data.user.id !== response.data.user.id || !organizations.some((org) => org.id === response.data!.organizationId)) {
      clearStoredSession();
      setUser(null);
      setError(profile.error || 'Could not verify the new account');
      setSessionTransitioning(false);
      return false;
    }
    storeSession(requestedToken || undefined, response.data.organizationId);
    setUser(profile.data.user);
    setSessionRevision((revision) => revision + 1);
    setSessionTransitioning(false);
    return true;
  };

  const logout = async (): Promise<void> => {
    const requestEpoch = ++authRequestEpochRef.current;
    setUser(null);
    setSessionTransitioning(true);
    setSessionRevision((revision) => revision + 1);
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Continue clearing local session even if server endpoint fails or user is offline
    }
    if (requestEpoch !== authRequestEpochRef.current) return;
    clearStoredSession();
    setSessionTransitioning(false);
    setMfaRequired(false);
    setMfaTicket(null);
  };

  const devLogin = async (role: string = 'Owner'): Promise<boolean> => {
    const requestEpoch = ++authRequestEpochRef.current;
    setError(null);
    try {
      const response = await apiClient.post<{
        user: AuthUser;
        token: string;
        organizationId: string;
      }>('/auth/dev-login', { role });

      if (requestEpoch !== authRequestEpochRef.current) return false;
      if (response.data?.user && response.data.token) {
        storeSession(response.data.token, response.data.organizationId);
        const requestedToken = localStorage.getItem('auth_token');
        const profile = await apiClient.get<{ user: AuthUser; organizations: Array<{ id: string }> }>('/auth/me');
        if (requestEpoch !== authRequestEpochRef.current || localStorage.getItem('auth_token') !== requestedToken) return false;
        const organizations = Array.isArray(profile.data?.organizations) ? profile.data.organizations : [];
        if (!profile.data?.user || profile.data.user.id !== response.data.user.id || !organizations.some((org) => org.id === response.data!.organizationId)) {
          clearStoredSession();
          setUser(null);
          setError(profile.error || 'Could not verify the new account');
          setSessionTransitioning(false);
          return false;
        }
        setUser(profile.data.user);
        setSessionRevision((revision) => revision + 1);
        setSessionTransitioning(false);
        return true;
      }
      setError(response.error || 'Dev login failed');
      setSessionTransitioning(false);
      return false;
    } catch (err: any) {
      setError(err?.message || 'Dev login failed');
      setSessionTransitioning(false);
      return false;
    }
  };

  const value = useMemo(
    () => ({ user, sessionRevision, sessionTransitioning, loading, error, mfaRequired, login, verifyMfa, cancelMfa, register, logout, devLogin }),
    [user, sessionRevision, sessionTransitioning, loading, error, mfaRequired, mfaTicket]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext) ?? null;
}
