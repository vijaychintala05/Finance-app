// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CashBalanceWidget } from '../components/dashboard/widgets/CashBalanceWidget';
afterEach(cleanup);
const accounts = Array.from({ length: 7 }, (_, i) => ({ id: String(i), name: `Account ${i}`, balance: i === 6 ? -50 : (i + 1) * 100 }));
const props = { accounts, total: 2050, asOfDate: '2026-09-16', money: (n: number) => `INR ${n}`, unmatchedCount: 3, onAccounts: vi.fn(), onReconcile: vi.fn() };
describe('Cash balance decisions and navigation', () => {
  it('surfaces negative balances first and explicitly identifies book balances', () => {
    render(<CashBalanceWidget {...props} />);
    expect(screen.getAllByRole('listitem')[0].textContent).toContain('Account 6');
    expect(screen.getByText('INR 2050')).toBeTruthy();
    expect(screen.getByText(/not bank-confirmed available funds/)).toBeTruthy();
    expect(screen.queryByText('Reconciled')).toBeNull();
    expect(screen.getByText(/As of 2026-09-16/)).toBeTruthy();
  });
  it('reveals accounts beyond the first five and keeps the total unfiltered while searching', () => {
    render(<CashBalanceWidget {...props} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 7 accounts' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find an account' }), { target: { value: 'Account 5' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('INR 2050')).toBeTruthy();
    expect(screen.getByText(/total above includes all accounts/)).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } });
    expect(screen.getByRole('status').textContent).toContain('No accounts match');
  });
  it('connects the bank and unmatched item actions to navigation', () => {
    render(<CashBalanceWidget {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /View bank accounts/ }));
    fireEvent.click(screen.getByRole('button', { name: /Review 3 unmatched/ }));
    expect(props.onAccounts).toHaveBeenCalledOnce();
    expect(props.onReconcile).toHaveBeenCalledOnce();
  });
  it('does not equate zero unmatched items with reconciliation certification', () => {
    render(<CashBalanceWidget {...props} unmatchedCount={0} />);
    expect(screen.getByRole('button', { name: /Review reconciliation/ })).toBeTruthy();
    expect(screen.queryByText(/Reconciled/)).toBeNull();
  });
  it('handles no posted activity and unavailable reconciliation without fabricated status', () => {
    render(<CashBalanceWidget {...props} accounts={[]} total={0} unmatchedCount={null} />);
    expect(screen.getByText(/No posted cash or bank balances/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /reconciliation/ })).toBeNull();
  });
});
