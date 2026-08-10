import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageEntityRepository } from '../repositories/LocalStorageRepository';
import { Invoice } from '../types';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, val: string) => store.set(key, val),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe('Organization Multi-Tenant Data Isolation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('isolates data between two distinct organizations', () => {
    const repo = new LocalStorageEntityRepository<Invoice>('invoices', () => []);

    // Create invoice in Org A
    repo.create('org-a', {
      invoiceNumber: 'INV-A-001',
      clientId: 'c1',
      clientName: 'Client Alpha',
      clientEmail: 'alpha@test.com',
      issueDate: '2026-01-01',
      dueDate: '2026-01-31',
      items: [],
      subtotal: 1000,
      taxTotal: 0,
      discount: 0,
      totalAmount: 1000,
      paidAmount: 0,
      balanceDue: 1000,
      status: 'Sent',
      createdAt: '2026-01-01',
    });

    // Create invoice in Org B
    repo.create('org-b', {
      invoiceNumber: 'INV-B-001',
      clientId: 'c2',
      clientName: 'Client Beta',
      clientEmail: 'beta@test.com',
      issueDate: '2026-01-01',
      dueDate: '2026-01-31',
      items: [],
      subtotal: 2000,
      taxTotal: 0,
      discount: 0,
      totalAmount: 2000,
      paidAmount: 0,
      balanceDue: 2000,
      status: 'Sent',
      createdAt: '2026-01-01',
    });

    const orgAInvoices = repo.getAll('org-a');
    const orgBInvoices = repo.getAll('org-b');

    expect(orgAInvoices.length).toBe(1);
    expect(orgAInvoices[0].invoiceNumber).toBe('INV-A-001');
    expect(orgAInvoices[0].organizationId).toBe('org-a');

    expect(orgBInvoices.length).toBe(1);
    expect(orgBInvoices[0].invoiceNumber).toBe('INV-B-001');
    expect(orgBInvoices[0].organizationId).toBe('org-b');
  });
});
