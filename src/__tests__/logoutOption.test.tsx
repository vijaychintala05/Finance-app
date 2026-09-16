// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Header } from '../components/layout/Header';
import { Sidebar } from '../components/layout/Sidebar';
import { MobileNav } from '../components/layout/MobileNav';
import { IdentitySettings } from '../components/settings/IdentitySettings';

const mockLogout = vi.fn().mockResolvedValue(undefined);
const mockNavigate = vi.fn();

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'usr-123', email: 'admin@firmbooks.com', fullName: 'Alexander Hamilton' },
    logout: mockLogout,
  }),
  useOptionalAuth: () => ({
    user: { id: 'usr-123', email: 'admin@firmbooks.com', fullName: 'Alexander Hamilton' },
    logout: mockLogout,
  }),
}));

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    settings: { firmName: 'FirmBooks Corp', currencyCode: 'USD', userPreferences: { theme: 'Light' } },
    currentOrg: { id: 'org-1', name: 'Treasury Financials', publicOrgId: 'FB-001' },
    currentUser: { id: 'usr-123', email: 'admin@firmbooks.com', fullName: 'Alexander Hamilton' },
    updateSettings: vi.fn(),
  }),
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      get: vi.fn().mockResolvedValue({ data: { isEnrolled: false, isVerified: false, isEnforced: false }, error: null }),
      post: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
    },
  };
});

describe('Log Out Option & User Profile Accessibility Test Suite', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('1. Header renders user profile button with user initial and name', () => {
    render(<Header onNavigate={mockNavigate} />);

    const userButton = screen.getByLabelText('User Account Menu');
    expect(userButton).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy(); // Initial of Alexander
    expect(screen.getByText('Alexander Hamilton')).toBeTruthy();
  });

  it('2. Clicking User Profile button in Header opens dropdown with Log Out option', () => {
    render(<Header onNavigate={mockNavigate} />);

    // Dropdown should initially not be visible
    expect(screen.queryByRole('button', { name: 'Log Out' })).toBeNull();

    // Click user profile button
    fireEvent.click(screen.getByLabelText('User Account Menu'));

    // Dropdown should now show user details and Log Out button
    expect(screen.getByRole('button', { name: 'Log Out' })).toBeTruthy();
    expect(screen.getByText('Settings & Preferences')).toBeTruthy();
    expect(screen.getByText('Security & Access')).toBeTruthy();
  });

  it('3. Clicking Log Out in Header dropdown invokes auth logout', async () => {
    render(<Header onNavigate={mockNavigate} />);

    fireEvent.click(screen.getByLabelText('User Account Menu'));

    const logoutBtn = screen.getByRole('button', { name: 'Log Out' });
    fireEvent.click(logoutBtn);

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('4. Sidebar renders user session card with accessible Log Out button', () => {
    render(<Sidebar activeTab="dashboard" setActiveTab={vi.fn()} />);

    expect(screen.getByText('Alexander Hamilton')).toBeTruthy();
    const sidebarLogoutBtn = screen.getByTitle('Log Out');
    expect(sidebarLogoutBtn).toBeTruthy();

    fireEvent.click(sidebarLogoutBtn);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('5. MobileNav drawer renders user profile section with full-width Log Out button', () => {
    const onClose = vi.fn();
    render(<MobileNav isOpen={true} onClose={onClose} activeTab="dashboard" setActiveTab={vi.fn()} />);

    expect(screen.getByText('Alexander Hamilton')).toBeTruthy();
    const mobileLogoutBtn = screen.getByRole('button', { name: 'Log Out' });
    expect(mobileLogoutBtn).toBeTruthy();

    fireEvent.click(mobileLogoutBtn);
    expect(onClose).toHaveBeenCalled();
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('5a. Mobile module drawer exposes the app routes and section headers only expand', () => {
    const onClose = vi.fn();
    const setActiveTab = vi.fn();
    render(<MobileNav isOpen={true} onClose={onClose} activeTab="dashboard" setActiveTab={setActiveTab} />);

    // Sales starts expanded, including the modules previously absent on phones.
    expect(screen.getByRole('button', { name: 'Estimates' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sales Orders' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delivery Challans' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sales' }));
    expect(setActiveTab).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Banking & Cash' }));
    expect(screen.getByRole('button', { name: 'Bank Reconciliation' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bank Reconciliation' }));
    expect(setActiveTab).toHaveBeenCalledWith('bank_reconciliation');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('5b. Mobile module drawer closes with Escape and restores page scrolling', () => {
    const onClose = vi.fn();
    const { unmount } = render(<MobileNav isOpen={true} onClose={onClose} activeTab="dashboard" setActiveTab={vi.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('6. IdentitySettings displays Active Session card with Log Out button', () => {
    render(<IdentitySettings />);

    expect(screen.getByText('Active Session')).toBeTruthy();
    const logoutBtn = screen.getByRole('button', { name: 'Log Out' });
    expect(logoutBtn).toBeTruthy();

    fireEvent.click(logoutBtn);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
