import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { calculateAuditEntryHash, GENESIS_HASH } from '../security/AuditTrailService';

const dbMock = vi.hoisted(() => ({ query: vi.fn() }));
const rbacMock = vi.hoisted(() => ({ hasPermissionAsync: vi.fn() }));
vi.mock('../database/db', () => ({ db: dbMock }));
vi.mock('../auth/RbacService', () => ({ RbacService: rbacMock }));

import { getInvoiceVoidOperationStatus } from '../services/InvoiceVoidOperationStatusService';

const input = {
  organizationId: 'org-1',
  userId: 'user-1',
  role: 'Owner',
  invoiceId: 'invoice-1',
  idempotencyKey: 'invoice-void-operation-key-1',
  reason: 'Duplicate customer invoice',
};

const operation = (overrides: Record<string, unknown> = {}) => ({
  state: 'COMPLETED',
  request_hash: crypto.createHash('sha256').update(JSON.stringify({ method: 'POST', path: '/api/v1/security/void-invoice', body: { invoiceId: input.invoiceId, reason: input.reason } })).digest('hex'),
  response_status: 200,
  response_body: { result: { success: true, invoiceId: 'invoice-1', journalEntryId: 'journal-reversal', auditLogId: 'audit-void-1' }, requestId: 'request-original' },
  user_id: 'user-1',
  required_permissions: ['invoices.void', 'invoices.delete'],
  method: 'POST',
  path: '/void-invoice',
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  ...overrides,
});

const evidence = (overrides: Record<string, unknown> = {}) => ({
  id: 'invoice-1', invoice_status: 'VOIDED', journal_entry_id: 'journal-original', reversal_journal_id: 'journal-reversal',
  original_status: 'POSTED', reversed_by_journal_id: 'journal-reversal', reversal_status: 'POSTED', reversal_of_journal_id: 'journal-original',
  ...overrides,
});

function setup(overrides: { operation?: Record<string, unknown>; evidence?: Record<string, unknown> | null; audits?: unknown[]; predecessor?: 'valid' | 'tampered' } = {}) {
  dbMock.query.mockReset();
  rbacMock.hasPermissionAsync.mockReset().mockResolvedValueOnce(true).mockResolvedValue(false);
  const resolvedOperation = operation(overrides.operation);
  dbMock.query.mockResolvedValueOnce({ rows: [resolvedOperation] });
  if (resolvedOperation.state === 'COMPLETED' && Number(resolvedOperation.response_status) === 200) {
    dbMock.query.mockResolvedValueOnce({ rows: overrides.evidence === null ? [] : [evidence(overrides.evidence)] });
    let predecessor: any = null;
    if (overrides.predecessor) {
      predecessor = {
        id: 'audit-prior-1', organization_id: 'org-1', user_id: 'user-1', action: 'INVOICE_CREATED',
        entity_type: 'Invoice', entity_id: 'invoice-1', timestamp: '2026-09-23T23:59:00.000Z',
        before_state: null, after_state: { amount: 125 }, metadata: {}, previous_hash: GENESIS_HASH, current_hash: '',
      };
      predecessor.current_hash = calculateAuditEntryHash(predecessor.previous_hash, predecessor.id, predecessor.organization_id, predecessor.user_id, predecessor.action, predecessor.entity_type, predecessor.entity_id, predecessor.timestamp, predecessor.before_state, predecessor.after_state, predecessor.metadata);
      if (overrides.predecessor === 'tampered') predecessor.action = 'TAMPERED_AFTER_HASH';
    }
    const auditRows = (overrides.audits ?? [{ after_state: { status: 'VOIDED', reason: input.reason.trim(), reversalJournalId: 'journal-reversal' } }]).map((audit: any) => {
      const afterState = audit.after_state ?? audit.afterState;
      const row = {
        id: 'audit-void-1', organization_id: 'org-1', user_id: 'user-1', action: 'INVOICE_VOIDED',
        entity_type: 'Invoice', entity_id: 'invoice-1', timestamp: '2026-09-24T00:00:00.000Z',
        before_state: { status: 'POSTED', balanceDue: 125 }, after_state: afterState, metadata: {},
        previous_hash: predecessor?.current_hash || GENESIS_HASH, current_hash: '',
      };
      row.current_hash = calculateAuditEntryHash(row.previous_hash, row.id, row.organization_id, row.user_id, row.action, row.entity_type, row.entity_id, row.timestamp, row.before_state, row.after_state, row.metadata);
      if (audit.current_hash) row.current_hash = audit.current_hash;
      return row;
    });
    dbMock.query.mockResolvedValueOnce({ rows: auditRows });
    if (predecessor) dbMock.query.mockResolvedValueOnce({ rows: [predecessor] });
  }
}

describe('invoice void operation status', () => {
  beforeEach(() => setup());

  it('confirms only the same actor, tenant, exact receipt, linked posted journals, and matching audit event', async () => {
    await expect(getInvoiceVoidOperationStatus(input)).resolves.toEqual({
      state: 'COMPLETED', invoiceId: 'invoice-1', reversalJournalId: 'journal-reversal', requestId: 'request-original',
    });
    expect(dbMock.query).toHaveBeenCalledTimes(3);
    expect(dbMock.query.mock.calls[0][1]).toEqual(['org-1', input.idempotencyKey]);
    expect(dbMock.query.mock.calls[1][1]).toEqual(['org-1', 'invoice-1']);
    expect(dbMock.query.mock.calls[2][1]).toEqual(['org-1', 'user-1', 'invoice-1', 'audit-void-1']);
    expect(rbacMock.hasPermissionAsync).toHaveBeenCalledWith('org-1', 'Owner', 'invoices.void', true);
    expect(rbacMock.hasPermissionAsync).toHaveBeenCalledWith('org-1', 'Owner', 'invoices.delete', true);
  });

  it.each([
    ['different actor', { user_id: 'user-2' }],
    ['wrong route', { path: '/reverse-payment' }],
    ['wrong method', { method: 'PUT' }],
    ['expired key', { expires_at: new Date(Date.now() - 60_000).toISOString() }],
    ['missing permission evidence', { required_permissions: null }],
    ['permission mismatch', { required_permissions: ['invoices.view'] }],
    ['in-progress record', { state: 'PROCESSING' }],
  ])('does not confirm %s', async (_label, overrides) => {
    setup({ operation: overrides });
    const result = await getInvoiceVoidOperationStatus(input);
    expect(result).toEqual({ state: overrides.state === 'PROCESSING' ? 'PROCESSING' : 'UNKNOWN' });
    expect(dbMock.query).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['different invoice with the same key', { ...input, invoiceId: 'invoice-2' }],
    ['different request reason', { ...input, reason: 'Different reason' }],
  ])('returns UNKNOWN for %s', async (_label, mismatchedInput) => {
    setup();
    await expect(getInvoiceVoidOperationStatus(mismatchedInput)).resolves.toEqual({ state: 'UNKNOWN' });
    expect(dbMock.query).toHaveBeenCalledTimes(1);
  });
  it('returns UNKNOWN when current void permission was revoked', async () => {
    setup();
    rbacMock.hasPermissionAsync.mockReset().mockResolvedValue(false);
    await expect(getInvoiceVoidOperationStatus(input)).resolves.toEqual({ state: 'UNKNOWN' });
    expect(dbMock.query).toHaveBeenCalledTimes(1);
  });

  it('returns the stored deterministic 4xx rejection without treating it as a commit', async () => {
    setup({ operation: { response_status: 409, response_body: { error: 'Reverse allocations first', code: 'INVOICE_HAS_ALLOCATED_PAYMENTS' } } });
    await expect(getInvoiceVoidOperationStatus(input)).resolves.toEqual({
      state: 'REJECTED', responseStatus: 409, error: 'Reverse allocations first', code: 'INVOICE_HAS_ALLOCATED_PAYMENTS',
    });
    expect(dbMock.query).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['invoice not void', { invoice_status: 'SENT' }, [{ after_state: { status: 'VOIDED', reason: input.reason.trim(), reversalJournalId: 'journal-reversal' } }]],
    ['mismatched invoice reversal', { reversal_journal_id: 'journal-other' }, [{ after_state: { status: 'VOIDED', reason: input.reason.trim(), reversalJournalId: 'journal-reversal' } }]],
    ['unposted reversal', { reversal_status: 'DRAFT' }, [{ after_state: { status: 'VOIDED', reason: input.reason.trim(), reversalJournalId: 'journal-reversal' } }]],
    ['broken original journal link', { reversed_by_journal_id: 'journal-other' }, [{ after_state: { status: 'VOIDED', reason: input.reason.trim(), reversalJournalId: 'journal-reversal' } }]],
    ['missing audit event', {}, []],
    ['audit points at a different journal', {}, [{ after_state: { status: 'VOIDED', reason: input.reason.trim(), reversalJournalId: 'journal-other' } }]],
    ['audit reason mismatch', {}, [{ after_state: { status: 'VOIDED', reason: 'A different reason', reversalJournalId: 'journal-reversal' } }]],
    ['audit status mismatch', {}, [{ after_state: { status: 'POSTED', reason: input.reason.trim(), reversalJournalId: 'journal-reversal' } }]],
  ])('holds a conflict when %s', async (_label, evidenceOverrides, audits) => {
    setup({ evidence: evidenceOverrides, audits });
    const result = await getInvoiceVoidOperationStatus(input);
    expect(result.state).toBe('CONFLICT');
    expect(dbMock.query).toHaveBeenCalledTimes(3);
  });

  it('rejects a tampered current audit hash', async () => {
    setup({ audits: [{ after_state: { status: 'VOIDED', reason: input.reason.trim(), reversalJournalId: 'journal-reversal' }, current_hash: 'f'.repeat(64) }] });
    const result = await getInvoiceVoidOperationStatus(input);
    expect(result.state).toBe('CONFLICT');
  });

  it.each([['valid', 'COMPLETED'], ['tampered', 'CONFLICT']] as const)('recomputes the immediate predecessor hash when it is %s', async (predecessor, expectedState) => {
    setup({ predecessor });
    const result = await getInvoiceVoidOperationStatus(input);
    expect(result.state).toBe(expectedState);
    expect(dbMock.query).toHaveBeenCalledTimes(4);
  });
  it('does not turn a database failure into UNKNOWN', async () => {
    dbMock.query.mockReset().mockRejectedValue(new Error('database unavailable'));
    await expect(getInvoiceVoidOperationStatus(input)).rejects.toThrow('database unavailable');
  });
});