import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { AuditTrailService } from '../security/AuditTrailService';

describe('invoice void operation receipt API', () => {
  beforeAll(async () => { await MigrationRunner.runMigrations(); });

  async function register(label: string) {
    return request(app).post('/api/v1/auth/register').send({
      email: `${label}-${Date.now()}-${Math.random()}@example.com`,
      password: 'SecurePassword123!',
      fullName: 'Invoice Void Owner',
      organizationName: 'Invoice Void Test Firm',
    });
  }

  it('rolls back internal failures, retries the exact key once, and verifies receipt plus linked financial and audit evidence', async () => {
    const registration = await register('invoice-void-operation');
    expect(registration.status).toBe(201);
    const organizationId = registration.body.organizationId;
    const auth = { Authorization: `Bearer ${registration.body.token}` };
    const customer = await request(app).post('/api/v1/customers')
      .set(auth)
      .set('Idempotency-Key', `void-customer-${Date.now()}`)
      .send({ displayName: 'Void Operation Customer' });
    expect(customer.status).toBe(201);
    const customerId = customer.body.id || customer.body.customer?.id;
    const invoice = await request(app).post('/api/v1/finance/invoices')
      .set(auth)
      .set('Idempotency-Key', `void-invoice-${Date.now()}`)
      .send({
        clientId: customerId,
        issueDate: '2026-09-01',
        dueDate: '2026-09-30',
        items: [{ description: 'Void operation service', quantity: 1, unitPrice: 125, taxRate: 0 }],
      });
    expect(invoice.status).toBe(201);
    const invoiceId = invoice.body.id;
    const requestKey = `void-operation-${Date.now()}-exact-key`;
    const payload = { invoiceId, reason: 'Duplicate invoice created during recovery test\\nCustomer confirmed correction — September' };
    const statusHeaders = { ...auth, 'Idempotency-Key': requestKey, 'X-Operation-Reason-Base64': Buffer.from(payload.reason, 'utf8').toString('base64url') };
    const precedingAudit = await AuditTrailService.logAction({
      organizationId, userId: registration.body.user.id, action: 'VOID_RECEIPT_PREDECESSOR_TEST',
      entityType: 'Invoice', entityId: invoiceId, afterState: { zeta: 'last', alpha: 'first' },
    }, { strict: true });

    const failOnce = vi.spyOn(AuditTrailService, 'appendBatchInTransaction').mockRejectedValueOnce(new Error('Injected transient audit failure'));
    const failed = await request(app).post('/api/v1/security/void-invoice')
      .set({ ...auth, 'Idempotency-Key': requestKey })
      .send(payload);
    failOnce.mockRestore();
    expect(failed.status).toBe(500);
    expect(failed.body.code).toBe('INVOICE_VOID_FAILED');
    const afterFailedCommit = await db.query('SELECT status, reversal_journal_id FROM invoices WHERE organization_id = $1 AND id = $2', [organizationId, invoiceId]);
    expect(afterFailedCommit.rows[0]).toMatchObject({ status: 'POSTED', reversal_journal_id: null });

    const unknown = await request(app).get(`/api/v1/security/void-invoice/${invoiceId}/operation-status`)
      .set(statusHeaders);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual({ state: 'UNKNOWN' });

    const committed = await request(app).post('/api/v1/security/void-invoice')
      .set({ ...auth, 'Idempotency-Key': requestKey })
      .send(payload);
    expect(committed.status).toBe(200);
    expect(committed.body.result).toMatchObject({ success: true, invoiceId });
    expect(committed.body.result.journalEntryId).toBeTruthy();
    expect(committed.body.result.auditLogId).toBeTruthy();
    expect(committed.body.requestId).toBeTruthy();

    const replayed = await request(app).post('/api/v1/security/void-invoice')
      .set({ ...auth, 'Idempotency-Key': requestKey })
      .send(payload);
    expect(replayed.status).toBe(200);
    expect(replayed.body).toEqual(committed.body);

    const status = await request(app).get(`/api/v1/security/void-invoice/${invoiceId}/operation-status`)
      .set(statusHeaders);
    expect(status.status).toBe(200);
    expect(status.body).toEqual({
      state: 'COMPLETED', invoiceId, reversalJournalId: committed.body.result.journalEntryId,
      requestId: committed.body.requestId,
    });

    const invoiceState = await db.query(
      'SELECT status, journal_entry_id, reversal_journal_id FROM invoices WHERE organization_id = $1 AND id = $2',
      [organizationId, invoiceId]
    );
    expect(invoiceState.rows[0]).toMatchObject({ status: 'VOIDED', reversal_journal_id: committed.body.result.journalEntryId });
    const journalState = await db.query(
      `SELECT UPPER(original.status) AS original_status, original.reversed_by_journal_id,
              UPPER(reversal.status) AS reversal_status, reversal.reversal_of_journal_id
         FROM invoices i
         JOIN journal_entries original ON original.organization_id = i.organization_id AND original.id = i.journal_entry_id
         JOIN journal_entries reversal ON reversal.organization_id = i.organization_id AND reversal.id = i.reversal_journal_id
        WHERE i.organization_id = $1 AND i.id = $2`,
      [organizationId, invoiceId]
    );
    expect(journalState.rows[0]).toMatchObject({
      original_status: 'POSTED',
      reversed_by_journal_id: committed.body.result.journalEntryId,
      reversal_status: 'POSTED',
      reversal_of_journal_id: invoiceState.rows[0].journal_entry_id,
    });
    const audits = await db.query(
      `SELECT id, after_state, previous_hash, current_hash FROM audit_logs
        WHERE organization_id = $1 AND user_id = $2 AND action = 'INVOICE_VOIDED'
          AND entity_type = 'Invoice' AND entity_id = $3`,
      [organizationId, registration.body.user.id, invoiceId]
    );
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0].after_state).toMatchObject({ status: 'VOIDED', reason: payload.reason.trim(), reversalJournalId: committed.body.result.journalEntryId });
    expect(audits.rows[0]).toMatchObject({ id: committed.body.result.auditLogId, previous_hash: precedingAudit.currentHash });
    expect(audits.rows[0].current_hash).toMatch(/^[a-f0-9]{64}$/);

    const mismatchedInvoiceStatus = await request(app).get(`/api/v1/security/void-invoice/${invoiceId}-other/operation-status`).set(statusHeaders);
    expect(mismatchedInvoiceStatus.body).toEqual({ state: 'UNKNOWN' });
    const mismatchedReasonStatus = await request(app).get(`/api/v1/security/void-invoice/${invoiceId}/operation-status`)
      .set({ ...statusHeaders, 'X-Operation-Reason-Base64': Buffer.from('A different saved reason', 'utf8').toString('base64url') });
    expect(mismatchedReasonStatus.body).toEqual({ state: 'UNKNOWN' });

    const secondOrganization = await register('invoice-void-other-tenant');
    const otherTenantStatus = await request(app).get(`/api/v1/security/void-invoice/${invoiceId}/operation-status`)
      .set({ Authorization: `Bearer ${secondOrganization.body.token}`, 'Idempotency-Key': requestKey, 'X-Operation-Reason-Base64': Buffer.from(payload.reason, 'utf8').toString('base64url') });
    expect(otherTenantStatus.status).toBe(200);
    expect(otherTenantStatus.body).toEqual({ state: 'UNKNOWN' });
  });
});