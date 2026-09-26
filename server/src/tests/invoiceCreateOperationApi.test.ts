import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { DrillDownService } from '../services/DrillDownService';

describe('invoice create operation receipt API', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db.initPgMem();
    expect(db.isMemoryMode()).toBe(true);
    await MigrationRunner.runMigrations();
  });

  it('recovers the exact committed invoice from the original request hash and evidence without reposting', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const registration = await request(app).post('/api/v1/auth/register').send({
      email: `invoice-create-receipt-${suffix}@example.com`,
      password: 'SecurePassword123!',
      fullName: 'Invoice Create Receipt Owner',
      organizationName: `Invoice Create Receipt ${suffix}`,
    });
    expect(registration.status).toBe(201);
    const organizationId = registration.body.organizationId as string;
    const userId = registration.body.user.id as string;
    const auth = { Authorization: `Bearer ${registration.body.token}` };

    const customer = await request(app).post('/api/v1/finance/clients')
      .set(auth)
      .send({ name: `Receipt Customer ${suffix}` });
    expect(customer.status).toBe(201);

    const key = `invoice-create-receipt-${suffix}`;
    const payload = {
      clientId: customer.body.id,
      issueDate: '2026-09-01',
      dueDate: '2026-09-30',
      items: [{ description: 'Receipt recovery service', quantity: 1, unitPrice: 125, taxRate: 0 }],
    };
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ method: 'POST', path: '/api/v1/finance/invoices', body: payload }))
      .digest('hex');

    const created = await request(app).post('/api/v1/finance/invoices')
      .set({ ...auth, 'Idempotency-Key': key })
      .send(payload);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'POSTED', commandId: expect.any(String), journalEntryId: expect.any(String) });

    const replay = await request(app).post('/api/v1/finance/invoices')
      .set({ ...auth, 'Idempotency-Key': key })
      .send(payload);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(created.body);

    const status = await request(app).get('/api/v1/finance/invoices/create-operation-status')
      .set({ ...auth, 'Idempotency-Key': key, 'X-Operation-Request-Hash': requestHash });
    expect(status.status).toBe(200);
    expect(status.body).toEqual({
      state: 'COMPLETED',
      invoiceId: created.body.id,
      commandId: created.body.commandId,
      invoiceNumber: created.body.invoiceNumber,
      invoiceStatus: 'POSTED',
      journalEntryId: created.body.journalEntryId,
    });

    const secondInvoice = await request(app).post('/api/v1/finance/invoices')
      .set(auth)
      .send({ clientId: customer.body.id, issueDate: '2026-09-02', dueDate: '2026-10-01', items: [{ description: 'Second invoice posting', quantity: 1, unitPrice: 80, taxRate: 0 }] });
    expect(secondInvoice.status).toBe(201);
    const storedRequest = await db.query(
      `SELECT method, path, request_hash, user_id FROM api_idempotency_keys
        WHERE organization_id = $1 AND idempotency_key = $2`,
      [organizationId, key],
    );
    expect(storedRequest.rows).toEqual([{
      method: 'POST', path: '/invoices', request_hash: requestHash, user_id: userId,
    }]);

    const invoiceRows = await db.query(
      `SELECT id, status FROM invoices WHERE organization_id = $1 AND id = $2`,
      [organizationId, created.body.id],
    );
    expect(invoiceRows.rows).toEqual([expect.objectContaining({ id: created.body.id, status: 'POSTED' })]);
    const journalRows = await db.query(
      `SELECT id, status FROM journal_entries WHERE organization_id = $1 AND id = $2`,
      [organizationId, created.body.journalEntryId],
    );
    expect(journalRows.rows).toHaveLength(1);
    expect(journalRows.rows[0].id).toBe(created.body.journalEntryId);
    expect(String(journalRows.rows[0].status).toUpperCase()).toBe('POSTED');
    const links = await db.query(
      `SELECT id, target_id FROM financial_evidence_links
        WHERE organization_id = $1 AND command_id = $2 AND source_type = 'Invoice' AND source_id = $3
          AND relation_type = 'POSTED_TO' AND target_type = 'JournalEntry'`,
      [organizationId, created.body.commandId, created.body.id],
    );
    expect(links.rows).toEqual([expect.objectContaining({ target_id: created.body.journalEntryId })]);
    const commands = await db.query(
      `SELECT COUNT(*)::int AS count FROM financial_commands
        WHERE organization_id = $1 AND idempotency_key = $2 AND command_type = 'invoice.post'`,
      [organizationId, key],
    );
    expect(commands.rows[0].count).toBe(1);

    await db.query('UPDATE invoices SET journal_entry_id = $1 WHERE organization_id = $2 AND id = $3', [secondInvoice.body.journalEntryId, organizationId, created.body.id]);

    const originalJournal = await request(app)
      .get(`/api/v1/finance/invoices/${created.body.id}/journal?journalEntryId=${encodeURIComponent(created.body.journalEntryId)}`)
      .set(auth);
    expect(originalJournal.status).toBe(200);
    expect(originalJournal.body.journalEntry.id).toBe(created.body.journalEntryId);
    expect(originalJournal.body.sourceDocument).toMatchObject({ id: created.body.id, documentNumber: created.body.invoiceNumber, type: 'INVOICE' });
    vi.spyOn(DrillDownService, 'getDrillDown').mockResolvedValueOnce({
      journalEntry: { id: 'je-entry-number-collision' },
      sourceDocument: {},
    } as any);
    const collidingJournalResolution = await request(app)
      .get(`/api/v1/finance/invoices/${created.body.id}/journal?journalEntryId=${encodeURIComponent(created.body.journalEntryId)}`)
      .set(auth);
    expect(collidingJournalResolution.status).toBe(404);

    const mismatchedJournal = await request(app)
      .get(`/api/v1/finance/invoices/${created.body.id}/journal?journalEntryId=${encodeURIComponent(secondInvoice.body.journalEntryId)}`)
      .set(auth);
    expect(mismatchedJournal.status).toBe(404);

    const otherTenant = await request(app).post('/api/v1/auth/register').send({
      email: `invoice-create-trace-other-${suffix}@example.com`, password: 'SecurePassword123!',
      fullName: 'Other Invoice Owner', organizationName: `Other Invoice Org ${suffix}`,
    });
    expect(otherTenant.status).toBe(201);
    const crossTenantJournal = await request(app)
      .get(`/api/v1/finance/invoices/${created.body.id}/journal?journalEntryId=${encodeURIComponent(created.body.journalEntryId)}`)
      .set({ Authorization: `Bearer ${otherTenant.body.token}` });
    expect(crossTenantJournal.status).toBe(404);

    await db.query(
      `DELETE FROM financial_evidence_links
        WHERE organization_id = $1 AND command_id = $2 AND source_type = 'Invoice'
          AND source_id = $3 AND target_id = $4`,
      [organizationId, created.body.commandId, created.body.id, created.body.journalEntryId],
    );
    const missingEvidenceJournal = await request(app)
      .get(`/api/v1/finance/invoices/${created.body.id}/journal?journalEntryId=${encodeURIComponent(created.body.journalEntryId)}`)
      .set(auth);
    expect(missingEvidenceJournal.status).toBe(404);
  });
});
