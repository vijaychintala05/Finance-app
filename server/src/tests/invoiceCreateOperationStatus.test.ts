import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({ query: vi.fn() }));
const rbacMock = vi.hoisted(() => ({ hasPermissionAsync: vi.fn() }));
vi.mock('../database/db', () => ({ db: dbMock }));
vi.mock('../auth/RbacService', () => ({ RbacService: rbacMock }));

import { getInvoiceCreateOperationStatus } from '../services/InvoiceCreateOperationStatusService';

const input = { organizationId: 'org-1', userId: 'user-1', role: 'Accountant', idempotencyKey: 'invoice-create-operation-123', requestHash: 'a'.repeat(64) };
const future = new Date(Date.now() + 60_000).toISOString();
const validRecord = (overrides: Record<string, unknown> = {}) => ({
  state: 'COMPLETED', response_status: 201, response_body: { id: 'inv-1', commandId: 'cmd-1', invoiceNumber: 'INV-1', status: 'POSTED', journalEntryId: 'je-1' }, request_hash: input.requestHash,
  user_id: input.userId, required_permissions: ['invoices.create'], method: 'POST', path: '/invoices', expires_at: future, ...overrides,
});
const validCommand = (overrides: Record<string, unknown> = {}) => ({
  id: 'cmd-1', actor_user_id: input.userId, command_type: 'invoice.post', status: 'COMPLETED',
  result: { id: 'inv-1', invoiceNumber: 'INV-1', status: 'POSTED', journalEntryId: 'je-1' }, ...overrides,
});

describe('invoice create operation status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.query.mockResolvedValueOnce({ rows: [validRecord()] })
      .mockResolvedValueOnce({ rows: [validCommand()] })
      .mockResolvedValueOnce({ rows: [{ id: 'inv-1', invoice_number: 'INV-1', status: 'POSTED' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'je-1', status: 'POSTED' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'evidence-1' }] });
    rbacMock.hasPermissionAsync.mockResolvedValue(true);
  });

  it('returns only reconciled invoice, command and posted journal evidence', async () => {
    await expect(getInvoiceCreateOperationStatus(input)).resolves.toEqual({
      state: 'COMPLETED', invoiceId: 'inv-1', commandId: 'cmd-1', invoiceNumber: 'INV-1', invoiceStatus: 'POSTED', journalEntryId: 'je-1',
    });
    expect(dbMock.query.mock.calls[0][1]).toEqual(['org-1', input.idempotencyKey]);
    expect(dbMock.query.mock.calls[1][0]).toContain("command_type = 'invoice.post'");
  });

  it.each(['PARTIALLY_PAID', 'Partially Paid', 'Unpaid', 'PAID', 'VOIDED', 'WRITTEN_OFF'])(
    'recognizes a created invoice after its lifecycle advances to %s', async (currentStatus) => {
      dbMock.query.mockReset()
        .mockResolvedValueOnce({ rows: [validRecord()] })
        .mockResolvedValueOnce({ rows: [validCommand()] })
        .mockResolvedValueOnce({ rows: [{ id: 'inv-1', invoice_number: 'INV-1', status: currentStatus, journal_entry_id: 'je-revision' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'je-1', status: 'POSTED' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'evidence-1' }] });
      await expect(getInvoiceCreateOperationStatus(input)).resolves.toMatchObject({ state: 'COMPLETED', invoiceStatus: String(currentStatus).trim().toUpperCase().replace(/\s+/g, '_'), journalEntryId: 'je-1' });
    },
  );

  it('accepts a submitted invoice without a journal', async () => {
    dbMock.query.mockReset()
      .mockResolvedValueOnce({ rows: [validRecord({ response_body: { id: 'inv-1', commandId: 'cmd-1', invoiceNumber: 'INV-1', status: 'SUBMITTED' } })] })
      .mockResolvedValueOnce({ rows: [validCommand({ result: { id: 'inv-1', invoiceNumber: 'INV-1', status: 'SUBMITTED' } })] })
      .mockResolvedValueOnce({ rows: [{ id: 'inv-1', invoice_number: 'INV-1', status: 'SUBMITTED', journal_entry_id: null, journal_status: null }] });
    await expect(getInvoiceCreateOperationStatus(input)).resolves.toMatchObject({ state: 'COMPLETED', invoiceStatus: 'SUBMITTED' });
  });

  it.each([
    ['other user', { user_id: 'user-2' }],
    ['wrong path', { path: '/invoices/other' }],
    ['wrong method', { method: 'PUT' }],
    ['wrong hash', { request_hash: 'b'.repeat(64) }],
    ['expired', { expires_at: new Date(Date.now() - 60_000).toISOString() }],
    ['malformed permissions', { required_permissions: '{bad' }],
    ['different permission', { required_permissions: ['invoices.view'] }],
    ['missing permission metadata', { required_permissions: null }],
  ])('returns UNKNOWN for %s', async (_label, overrides) => {
    dbMock.query.mockReset().mockResolvedValueOnce({ rows: [validRecord(overrides)] });
    await expect(getInvoiceCreateOperationStatus(input)).resolves.toEqual({ state: 'UNKNOWN' });
  });

  it('does not disclose status when create permission is revoked', async () => {
    rbacMock.hasPermissionAsync.mockResolvedValue(false);
    dbMock.query.mockReset().mockResolvedValueOnce({ rows: [validRecord()] });
    await expect(getInvoiceCreateOperationStatus(input)).resolves.toEqual({ state: 'UNKNOWN' });
  });

  it('holds processing and malformed completion evidence', async () => {
    dbMock.query.mockReset().mockResolvedValueOnce({ rows: [validRecord({ state: 'PROCESSING' })] });
    await expect(getInvoiceCreateOperationStatus(input)).resolves.toEqual({ state: 'PROCESSING' });
    dbMock.query.mockReset()
      .mockResolvedValueOnce({ rows: [validRecord()] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(getInvoiceCreateOperationStatus(input)).resolves.toMatchObject({ state: 'CONFLICT' });
  });

  it('reports only a stored terminal 4xx rejection when no posting command exists', async () => {
    dbMock.query.mockReset()
      .mockResolvedValueOnce({ rows: [validRecord({ response_status: 409, response_body: { code: 'INVOICE_CONFLICT', error: 'Invoice rejected' } })] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(getInvoiceCreateOperationStatus(input)).resolves.toEqual({
      state: 'REJECTED', responseStatus: 409, code: 'INVOICE_CONFLICT', error: 'Invoice rejected',
    });
  });

  it('rejects a completion response that does not match its posted invoice evidence', async () => {
    dbMock.query.mockReset()
      .mockResolvedValueOnce({ rows: [validRecord({ response_body: { id: 'inv-1', commandId: 'cmd-1', invoiceNumber: 'INV-OTHER', status: 'POSTED', journalEntryId: 'je-1' } })] })
      .mockResolvedValueOnce({ rows: [validCommand()] })
      .mockResolvedValueOnce({ rows: [{ id: 'inv-1', invoice_number: 'INV-1', status: 'POSTED' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'je-1', status: 'POSTED' }] });
    await expect(getInvoiceCreateOperationStatus(input)).resolves.toMatchObject({ state: 'CONFLICT' });
  });

  it('rejects an invoice number mismatch in the immutable command result', async () => {
    dbMock.query.mockReset()
      .mockResolvedValueOnce({ rows: [validRecord()] })
      .mockResolvedValueOnce({ rows: [validCommand({ result: { id: 'inv-1', invoiceNumber: 'INV-OTHER', status: 'POSTED', journalEntryId: 'je-1' } })] })
      .mockResolvedValueOnce({ rows: [{ id: 'inv-1', invoice_number: 'INV-1', status: 'POSTED' }] });
    await expect(getInvoiceCreateOperationStatus(input)).resolves.toMatchObject({ state: 'CONFLICT' });
    expect(dbMock.query).toHaveBeenCalledTimes(3);
  });

  it('does not complete when the original invoice-to-journal evidence link is absent', async () => {
    dbMock.query.mockReset()
      .mockResolvedValueOnce({ rows: [validRecord()] })
      .mockResolvedValueOnce({ rows: [validCommand()] })
      .mockResolvedValueOnce({ rows: [{ id: 'inv-1', invoice_number: 'INV-1', status: 'POSTED' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'je-1', status: 'POSTED' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(getInvoiceCreateOperationStatus(input)).resolves.toMatchObject({ state: 'CONFLICT' });
  });

  it('does not complete when the journal is absent or not posted', async () => {
    dbMock.query.mockReset()
      .mockResolvedValueOnce({ rows: [validRecord()] })
      .mockResolvedValueOnce({ rows: [validCommand()] })
      .mockResolvedValueOnce({ rows: [{ id: 'inv-1', invoice_number: 'INV-1', status: 'PARTIALLY_PAID' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(getInvoiceCreateOperationStatus(input)).resolves.toMatchObject({ state: 'CONFLICT' });
  });
});
