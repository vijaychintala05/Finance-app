import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

describe('Bank account deletion API and safeguards', () => {
  const priorTrustedFeatures = process.env.TRUSTED_FINANCE_FEATURES;

  beforeAll(async () => {
    process.env.TRUSTED_FINANCE_FEATURES = '';
    db.initPgMem();
    await MigrationRunner.runMigrations();
  });

  afterAll(() => {
    if (priorTrustedFeatures === undefined) delete process.env.TRUSTED_FINANCE_FEATURES;
    else process.env.TRUSTED_FINANCE_FEATURES = priorTrustedFeatures;
  });

  it('successfully creates and deletes a clean bank profile and its ledger account', async () => {
    const suffix = Date.now();
    const registered = await request(app).post('/api/v1/auth/register').send({
      email: `bank-del-owner-${suffix}@example.test`,
      password: 'SecurePassword123!',
      fullName: 'Bank Account Deleter',
      organizationName: `Bank Delete Firm ${suffix}`,
    });
    expect(registered.status).toBe(201);

    const authHeaders = {
      Authorization: `Bearer ${registered.body.token}`,
      'X-Organization-ID': registered.body.organizationId,
    };

    // 1. Create ledger account
    const ledger = await request(app).post('/api/v1/finance/accounts').set({
      ...authHeaders,
      'Idempotency-Key': `bank-del-ledger-${suffix}`,
    }).send({
      code: '1620',
      name: 'Temporary Clean Bank Account',
      type: 'Asset',
      subType: 'Bank',
      balance: 0,
    });
    expect(ledger.status).toBe(201);

    // 2. Create bank account profile
    const created = await request(app).post('/api/v1/banking/accounts').set({
      ...authHeaders,
      'Idempotency-Key': `bank-del-profile-${suffix}`,
    }).send({
      ledgerAccountId: ledger.body.id,
      accountName: 'Temporary Clean Bank Account',
      accountNumber: '9876543210',
      bankName: 'ICICI Bank',
      currency: 'INR',
      openingBalanceDate: '2026-09-01',
      currentBalance: 0,
    });
    expect(created.status).toBe(201);
    const bankAccountId = created.body.data.id;

    // 3. Verify it is present in banking accounts
    const beforeDelete = await request(app).get('/api/v1/banking/accounts').set(authHeaders);
    expect(beforeDelete.status).toBe(200);
    expect(beforeDelete.body.data.some((a: any) => a.id === bankAccountId)).toBe(true);

    // 4. Delete the bank account
    const deleteRes = await request(app).delete(`/api/v1/banking/accounts/${bankAccountId}`).set({
      ...authHeaders,
      'Idempotency-Key': `bank-del-action-${suffix}`,
    });
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);
    expect(deleteRes.body.data.deleted).toBe(true);

    // 5. Verify it is no longer returned in banking accounts
    const afterDelete = await request(app).get('/api/v1/banking/accounts').set(authHeaders);
    expect(afterDelete.status).toBe(200);
    expect(afterDelete.body.data.some((a: any) => a.id === bankAccountId)).toBe(false);

    // 6. Verify the linked ledger account was also removed
    const ledgerCheck = await request(app).get('/api/v1/finance/accounts').set(authHeaders);
    expect(ledgerCheck.status).toBe(200);
    expect(ledgerCheck.body.some((a: any) => a.id === ledger.body.id)).toBe(false);

    // 7. Verify audit log was recorded
    const auditRes = await db.query(
      `SELECT * FROM audit_logs WHERE organization_id = $1 AND action = 'BANK_ACCOUNT_DELETED' AND entity_id = $2`,
      [registered.body.organizationId, bankAccountId]
    );
    expect(auditRes.rows.length).toBe(1);
    expect(auditRes.rows[0].entity_type).toBe('BankAccount');
  });

  it('rejects deletion of a bank account with non-zero balance', async () => {
    const suffix = Date.now() + 1;
    const registered = await request(app).post('/api/v1/auth/register').send({
      email: `bank-bal-owner-${suffix}@example.test`,
      password: 'SecurePassword123!',
      fullName: 'Bank Account Balance Tester',
      organizationName: `Bank Balance Firm ${suffix}`,
    });
    expect(registered.status).toBe(201);

    const authHeaders = {
      Authorization: `Bearer ${registered.body.token}`,
      'X-Organization-ID': registered.body.organizationId,
    };

    const ledger = await request(app).post('/api/v1/finance/accounts').set({
      ...authHeaders,
      'Idempotency-Key': `bank-bal-ledger-${suffix}`,
    }).send({
      code: '1621',
      name: 'Bank With Balance',
      type: 'Asset',
      subType: 'Bank',
      balance: 0,
    });
    expect(ledger.status).toBe(201);

    const created = await request(app).post('/api/v1/banking/accounts').set({
      ...authHeaders,
      'Idempotency-Key': `bank-bal-profile-${suffix}`,
    }).send({
      ledgerAccountId: ledger.body.id,
      accountName: 'Bank With Balance',
      accountNumber: '1122334455',
      bankName: 'State Bank of India',
      currency: 'INR',
      openingBalanceDate: '2026-09-01',
      currentBalance: 0,
    });
    expect(created.status).toBe(201);
    const bankAccountId = created.body.data.id;

    // Simulate balance on the bank account
    await db.query(`UPDATE bank_accounts SET current_balance = 5000.00 WHERE id = $1`, [bankAccountId]);

    // Deletion must be rejected
    const deleteRes = await request(app).delete(`/api/v1/banking/accounts/${bankAccountId}`).set(authHeaders);
    expect(deleteRes.status).toBe(409);
    expect(deleteRes.body.success).toBe(false);
    expect(deleteRes.body.error).toMatch(/non-zero balance/i);
  });

  it('rejects deletion of a bank account with statement imports', async () => {
    const suffix = Date.now() + 2;
    const registered = await request(app).post('/api/v1/auth/register').send({
      email: `bank-stmt-owner-${suffix}@example.test`,
      password: 'SecurePassword123!',
      fullName: 'Bank Stmt Tester',
      organizationName: `Bank Stmt Firm ${suffix}`,
    });
    expect(registered.status).toBe(201);

    const authHeaders = {
      Authorization: `Bearer ${registered.body.token}`,
      'X-Organization-ID': registered.body.organizationId,
    };

    const ledger = await request(app).post('/api/v1/finance/accounts').set({
      ...authHeaders,
      'Idempotency-Key': `bank-stmt-ledger-${suffix}`,
    }).send({
      code: '1622',
      name: 'Bank With Statement History',
      type: 'Asset',
      subType: 'Bank',
      balance: 0,
    });
    expect(ledger.status).toBe(201);

    const created = await request(app).post('/api/v1/banking/accounts').set({
      ...authHeaders,
      'Idempotency-Key': `bank-stmt-profile-${suffix}`,
    }).send({
      ledgerAccountId: ledger.body.id,
      accountName: 'Bank With Statement History',
      accountNumber: '5566778899',
      bankName: 'Axis Bank',
      currency: 'INR',
      openingBalanceDate: '2026-09-01',
      currentBalance: 0,
    });
    expect(created.status).toBe(201);
    const bankAccountId = created.body.data.id;

    // Simulate a statement import record
    await db.query(
      `INSERT INTO bank_statement_imports (id, organization_id, bank_account_id, source_format, original_filename, file_hash, currency)
       VALUES ('imp-test-1', $1, $2, 'CSV', 'stmt.csv', 'hash123', 'INR')`,
      [registered.body.organizationId, bankAccountId]
    );

    const deleteRes = await request(app).delete(`/api/v1/banking/accounts/${bankAccountId}`).set(authHeaders);
    expect(deleteRes.status).toBe(409);
    expect(deleteRes.body.success).toBe(false);
    expect(deleteRes.body.error).toMatch(/statement import history/i);
  });

  it('returns 404 when attempting to delete a non-existent bank account', async () => {
    const suffix = Date.now() + 3;
    const registered = await request(app).post('/api/v1/auth/register').send({
      email: `bank-404-owner-${suffix}@example.test`,
      password: 'SecurePassword123!',
      fullName: 'Bank 404 Tester',
      organizationName: `Bank 404 Firm ${suffix}`,
    });
    expect(registered.status).toBe(201);

    const authHeaders = {
      Authorization: `Bearer ${registered.body.token}`,
      'X-Organization-ID': registered.body.organizationId,
    };

    const deleteRes = await request(app).delete('/api/v1/banking/accounts/non-existent-id').set(authHeaders);
    expect(deleteRes.status).toBe(404);
    expect(deleteRes.body.success).toBe(false);
  });
});
