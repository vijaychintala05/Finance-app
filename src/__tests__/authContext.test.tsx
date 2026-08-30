// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';

describe('AuthContext & Session Lifecycle Test Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  it('1. Initial load sets unauthenticated state when /auth/me returns no user', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: null, error: 'Unauthorized', status: 401 });

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('2. Initial load hydrates user and active org when /auth/me succeeds', async () => {
    const mockUser = { id: 'usr-1', email: 'test@example.com', fullName: 'Jane Doe' };
    const mockOrgs = [{ id: 'org-1' }, { id: 'org-2' }];

    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { user: mockUser, organizations: mockOrgs },
      error: null,
      status: 200,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.user).toEqual(mockUser);
    expect(localStorage.getItem('firmbooks_authenticated')).toBe('true');
    expect(localStorage.getItem('active_organization_id')).toBe('org-1');
  });

  it('3. Successful login flow stores token, loads profile, and updates user state', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: null, error: null, status: 200 }); // initial /auth/me

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    const mockUser = { id: 'usr-2', email: 'owner@test.com', fullName: 'Alice Smith' };
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { user: mockUser, token: 'jwt-mock-token' },
      error: null,
      status: 200,
    });
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { user: mockUser, organizations: [{ id: 'org-abc' }] },
      error: null,
      status: 200,
    });

    let success = false;
    await act(async () => {
      success = await result.current.login('owner@test.com', 'SecretPass123!');
    });

    expect(success).toBe(true);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.error).toBeNull();
    expect(localStorage.getItem('active_organization_id')).toBe('org-abc');
  });

  it('4. Failed login sets error and returns false', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: null, error: null, status: 200 });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: null,
      error: 'Invalid email or password',
      status: 401,
    });

    let success = true;
    await act(async () => {
      success = await result.current.login('bad@test.com', 'wrong');
    });

    expect(success).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.error).toBe('Invalid email or password');
  });

  it('5. Successful registration creates session and sets user', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: null, error: null, status: 200 });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    const newUser = { id: 'usr-new', email: 'new@test.com', fullName: 'Bob Builder' };
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: { user: newUser, token: 'reg-token', organizationId: 'org-reg-1' },
      error: null,
      status: 200,
    });

    let success = false;
    await act(async () => {
      success = await result.current.register({
        email: 'new@test.com',
        password: 'Pass123!Secure',
        fullName: 'Bob Builder',
        organizationName: 'Bob Corp',
        country: 'India',
        baseCurrency: 'INR',
      });
    });

    expect(success).toBe(true);
    expect(result.current.user).toEqual(newUser);
    expect(localStorage.getItem('active_organization_id')).toBe('org-reg-1');
  });

  it('6. Logout clears storage and resets user to null', async () => {
    const mockUser = { id: 'usr-1', email: 'test@example.com', fullName: 'Jane Doe' };
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: { user: mockUser, organizations: [{ id: 'org-1' }] },
      error: null,
      status: 200,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    expect(result.current.user).toBeTruthy();

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ data: { message: 'Logged out' }, error: null, status: 200 });

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('active_organization_id')).toBeNull();
    expect(localStorage.getItem('firmbooks_authenticated')).toBeNull();
  });

  it('7. useAuth throws error when used outside AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used inside AuthProvider');
  });
});
