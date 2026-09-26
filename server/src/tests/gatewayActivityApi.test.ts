import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { decodeGatewayActivityCursor, encodeGatewayActivityCursor } from '../services/GatewayActivityService';

async function registerOrg(label: string) {
  const response = await request(app).post('/api/v1/auth/register').send({
    email: `gateway-activity-${label}-${Date.now()}-${Math.random()}@example.com`,
    password: 'SecurePassword123!',
    fullName: `Gateway Activity ${label}`,
    organizationName: `Gateway Activity ${label}`,
  });
  expect(response.status).toBe(201);
  return {
    organizationId: response.body.organizationId as string,
    auth: { Authorization: `Bearer ${response.body.token}` },
  };
}

describe('Banking gateway activity evidence API', () => {
  it('preserves sub-millisecond timestamp precision in keyset cursors', () => {
    const timestamp = '2026-09-20 10:00:00.123456+00';
    const cursor = encodeGatewayActivityCursor(timestamp, 'event-2');
    expect(decodeGatewayActivityCursor(cursor)).toEqual({ createdAt: timestamp, id: 'event-2' });
  });

  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  it('scopes events to the authenticated tenant, sanitizes provider data, and distinguishes payout matching from receipt posting', async () => {
    const [tenantA, tenantB] = await Promise.all([registerOrg('A'), registerOrg('B')]);
    const payoutJournalId = `gateway-journal-${Date.now()}`;
    const receiptId = `gateway-receipt-${Date.now()}`;
    const payoutId = `gateway-payout-${Date.now()}`;
    const otherTenantId = `gateway-other-${Date.now()}`;
    const reversedId = `gateway-reversed-${Date.now()}`;
    const validReversedId = `gateway-valid-reversed-${Date.now()}`;
    const originalReversalJournalId = `gateway-original-reversal-journal-${Date.now()}`;
    const reversalJournalId = `gateway-reversal-journal-${Date.now()}`;
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, status)
       VALUES ($1, $2, $3, CURRENT_DATE, 'Posted')`,
      [payoutJournalId, tenantA.organizationId, `${payoutJournalId}-N`]
    );
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, status) VALUES
       ($1, $3, $1, CURRENT_DATE, 'Posted'), ($2, $3, $2, CURRENT_DATE, 'Posted')`,
      [originalReversalJournalId, reversalJournalId, tenantA.organizationId]
    );
    await db.query(
      `INSERT INTO payment_gateway_events
         (id, organization_id, gateway, event_id, event_type, payload, status, amount, journal_entry_id, created_at)
       VALUES
         ($1, $2, 'stripe', $1, 'payout.paid', $3::jsonb, 'PROCESSED', 100, $4, '2026-09-20T10:00:00Z'),
         ($5, $2, 'stripe', $5, 'payment.succeeded', $6::jsonb, 'PROCESSED', 100, NULL, '2026-09-20T09:00:00Z'),
         ($7, $8, 'stripe', $7, 'payment.succeeded', $6::jsonb, 'PROCESSED', 100, NULL, '2026-09-20T09:00:00Z'),
         ($9, $2, 'stripe', $9, 'charge.dispute.created', $6::jsonb, 'REVERSED', 100, NULL, '2026-09-20T08:00:00Z'),
         ($10, $2, 'stripe', $10, 'charge.dispute.created', $6::jsonb, 'REVERSED', 100, $11, '2026-09-20T07:00:00Z')`,
      [
        payoutId, tenantA.organizationId,
        JSON.stringify({ data: { object: { currency: 'usd', secret: 'provider-private-payout-value' } } }),
        payoutJournalId, receiptId,
        JSON.stringify({ data: { object: { currency: 'usd', secret: 'provider-private-receipt-value' } } }),
        otherTenantId, tenantB.organizationId, reversedId, validReversedId, originalReversalJournalId,
      ]
    );
    await db.query(
      `UPDATE payment_gateway_events SET reversal_journal_id = $1 WHERE organization_id = $2 AND id = $3`,
      [reversalJournalId, tenantA.organizationId, validReversedId]
    );
    await db.query(
      `INSERT INTO bank_reconciliation_matches
         (id, organization_id, statement_transaction_id, accounting_transaction_type, accounting_transaction_id, matched_amount)
       VALUES ($1, $2, $3, 'journal', $4, 100)`,
      [`gateway-match-${Date.now()}`, tenantA.organizationId, 'provider-statement-row', payoutJournalId]
    );

    const response = await request(app).get('/api/v1/banking/gateway-activity?limit=1').set(tenantA.auth);
    expect(response.status).toBe(200);
    expect(response.body.data.events).toHaveLength(1);
    expect(response.body.data.nextCursor).toBeTruthy();
    const payout = response.body.data.events[0];
    expect(payout).toMatchObject({
      evidenceStatus: 'POSTED_TO_LEDGER',
      journalEntryId: payoutJournalId,
      payoutBankMatchCount: 1,
      currency: 'USD',
    });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('provider-private');
    expect(serialized).not.toContain('payload');
    expect(serialized).not.toContain(tenantB.organizationId);

    const nextPage = await request(app).get(`/api/v1/banking/gateway-activity?limit=1&cursor=${encodeURIComponent(response.body.data.nextCursor || '')}`).set(tenantA.auth);
    expect(nextPage.status).toBe(200);
    expect(nextPage.body.data.events).toHaveLength(1);
    const receipt = nextPage.body.data.events[0];
    expect(receipt.eventId).toBe(receiptId);
    expect(receipt.evidenceStatus).toBe('POSTING_EVIDENCE_MISSING');
    expect(JSON.stringify(nextPage.body)).not.toContain(tenantB.organizationId);
    const reversedPage = await request(app).get('/api/v1/banking/gateway-activity?status=REVERSED').set(tenantA.auth);
    expect(reversedPage.status).toBe(200);
    expect(reversedPage.body.data.events).toHaveLength(2);
    expect(reversedPage.body.data.events.find((event: any) => event.eventId === reversedId).evidenceStatus).toBe('REVERSAL_EVIDENCE_MISSING');
    expect(reversedPage.body.data.events.find((event: any) => event.eventId === validReversedId)).toMatchObject({
      evidenceStatus: 'REVERSED', journalEntryId: originalReversalJournalId, reversalJournalId,
    });
  });

  it('rejects unbounded page sizes and invalid cursors', async () => {
    const tenant = await registerOrg('validation');
    expect((await request(app).get('/api/v1/banking/gateway-activity?limit=101').set(tenant.auth)).status).toBe(400);
    expect((await request(app).get('/api/v1/banking/gateway-activity?cursor=not-a-cursor').set(tenant.auth)).status).toBe(400);
    expect((await request(app).get('/api/v1/banking/gateway-activity?gateway=stripe&gateway=razorpay').set(tenant.auth)).status).toBe(400);
  });
});
