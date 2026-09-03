import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

describe('Core bank account setup API', () => {
  const priorTrustedFeatures = process.env.TRUSTED_FINANCE_FEATURES;

  beforeAll(async () => {
    // An explicit empty deployment configuration used to disable this route.
    process.env.TRUSTED_FINANCE_FEATURES = '';
    db.initPgMem();
    await MigrationRunner.runMigrations();
  });

  afterAll(() => {
    if (priorTrustedFeatures === undefined) delete process.env.TRUSTED_FINANCE_FEATURES;
    else process.env.TRUSTED_FINANCE_FEATURES = priorTrustedFeatures;
  });

  it('creates and lists a zero-balance bank profile without optional deployment flags', async () => {
    const suffix = Date.now();
    const registered = await request(app).post('/api/v1/auth/register').send({
      email: `bank-owner-${suffix}@example.test`,
      password: 'SecurePassword123!',
      fullName: 'Bank Account Owner',
      organizationName: `Bank Account Firm ${suffix}`,
    });
    expect(registered.status).toBe(201);

    const authHeaders = {
      Authorization: `Bearer ${registered.body.token}`,
      'X-Organization-ID': registered.body.organizationId,
    };
    const ledger = await request(app).post('/api/v1/finance/accounts').set({
      ...authHeaders,
      'Idempotency-Key': `bank-ledger-${suffix}`,
    }).send({
      code: '1610',
      name: 'HDFC Operating Account',
      type: 'Asset',
      subType: 'Bank',
      balance: 0,
    });
    expect(ledger.status).toBe(201);

    // The client refreshes this endpoint immediately after creating the
    // ledger account. It must retain the tenant context under PostgreSQL RLS.
    const refreshedLedgerAccounts = await request(app)
      .get('/api/v1/finance/accounts')
      .set(authHeaders);
    expect(refreshedLedgerAccounts.status).toBe(200);
    expect(refreshedLedgerAccounts.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: ledger.body.id, code: '1610' }),
    ]));

    const created = await request(app).post('/api/v1/banking/accounts').set({
      ...authHeaders,
      'Idempotency-Key': `bank-profile-${suffix}`,
    }).send({
      ledgerAccountId: ledger.body.id,
      accountName: 'HDFC Operating Account',
      accountNumber: '1234567890',
      bankName: 'HDFC Bank',
      currency: 'INR',
      openingBalanceDate: '2026-09-03',
      currentBalance: 0,
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      ledgerAccountId: ledger.body.id,
      accountName: 'HDFC Operating Account',
      bankName: 'HDFC Bank',
      currentBalance: 0,
    });

    const listed = await request(app).get('/api/v1/banking/accounts').set(authHeaders);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.body.data.id, ledgerAccountId: ledger.body.id }),
    ]));
  });
});
