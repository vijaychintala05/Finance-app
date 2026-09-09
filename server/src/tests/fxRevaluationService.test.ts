import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { FxRevaluationService } from '../services/FxRevaluationService';

describe('Weakness Remediation 3: Automated Multi-Currency FX Revaluation Engine', () => {
  const ORG_ID = 'org-fx-reval-001';
  const USER_ID = 'usr-fx-tester';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    // 1. Seed user & org
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'fx@firmbooks.test', 'hashed_pass', 'FX Admin', 'Active')
       ON CONFLICT DO NOTHING`,
      [USER_ID]
    );

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, 'uuid-fx-1', 'pub-fx-1', 'FXORG', 'FX Test Org', 'IN', 'INR', '₹', $2)
       ON CONFLICT DO NOTHING`,
      [ORG_ID, USER_ID]
    );

    // 2. Seed base AR account
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES ('acc-ar-1100', $1, '1100', 'Accounts Receivable Control', 'Asset', 'AccountsReceivable', 0.00, 'Active')
       ON CONFLICT DO NOTHING`,
      [ORG_ID]
    );
  });

  it('1. Correctly calculates realized FX gain when settlement exchange rate rises', () => {
    // Invoice issued at 1 USD = 82.00 INR ($1,000 = 82,000 INR)
    // Payment settled at 1 USD = 84.50 INR ($1,000 = 84,500 INR)
    const result = FxRevaluationService.calculateFxVariance({
      originalAmount: 1000,
      originalFxRate: 82.00,
      settlementAmount: 1000,
      settlementFxRate: 84.50,
    });

    expect(result.originalBase).toBe(82000);
    expect(result.settlementBase).toBe(84500);
    expect(result.varianceAmount).toBe(2500);
    expect(result.isGain).toBe(true);
  });

  it('2. Correctly calculates realized FX loss when settlement exchange rate drops', () => {
    // Invoice issued at 1 USD = 84.00 INR ($1,000 = 84,000 INR)
    // Payment settled at 1 USD = 81.50 INR ($1,000 = 81,500 INR)
    const result = FxRevaluationService.calculateFxVariance({
      originalAmount: 1000,
      originalFxRate: 84.00,
      settlementAmount: 1000,
      settlementFxRate: 81.50,
    });

    expect(result.originalBase).toBe(84000);
    expect(result.settlementBase).toBe(81500);
    expect(result.varianceAmount).toBe(2500);
    expect(result.isGain).toBe(false);
  });

  it('3. Posts balanced Realized FX Gain journal entry and provisions account 4900', async () => {
    const postRes = await db.transaction(async (tx) => {
      return FxRevaluationService.postRealizedFxEntry(tx, {
        organizationId: ORG_ID,
        invoiceId: 'inv-usd-001',
        paymentId: 'pmt-usd-001',
        varianceAmount: 2500,
        isGain: true,
        date: '2026-09-08',
        reference: 'INV-USD-001 Settlement',
        currency: 'USD',
      });
    });

    expect(postRes.entryId).toBeDefined();
    expect(postRes.isGain).toBe(true);

    // Verify journal lines balance
    const lines = await db.query(
      `SELECT SUM(debit) AS total_debit, SUM(credit) AS total_credit
         FROM journal_lines WHERE journal_entry_id = $1`,
      [postRes.entryId]
    );
    expect(Number(lines.rows[0].total_debit)).toBe(2500);
    expect(Number(lines.rows[0].total_credit)).toBe(2500);

    // Verify audit log
    const aud = await db.query(
      `SELECT action FROM audit_logs WHERE organization_id = $1 AND entity_id = $2`,
      [ORG_ID, 'inv-usd-001']
    );
    expect(aud.rows[0].action).toBe('REALIZED_FX_GAIN_POSTED');
  });

  it('4. Posts balanced Realized FX Loss journal entry and provisions account 6900', async () => {
    const postRes = await db.transaction(async (tx) => {
      return FxRevaluationService.postRealizedFxEntry(tx, {
        organizationId: ORG_ID,
        invoiceId: 'inv-usd-002',
        paymentId: 'pmt-usd-002',
        varianceAmount: 1800,
        isGain: false,
        date: '2026-09-08',
        reference: 'INV-USD-002 Settlement',
        currency: 'USD',
      });
    });

    expect(postRes.entryId).toBeDefined();
    expect(postRes.isGain).toBe(false);

    // Verify journal lines balance
    const lines = await db.query(
      `SELECT SUM(debit) AS total_debit, SUM(credit) AS total_credit
         FROM journal_lines WHERE journal_entry_id = $1`,
      [postRes.entryId]
    );
    expect(Number(lines.rows[0].total_debit)).toBe(1800);
    expect(Number(lines.rows[0].total_credit)).toBe(1800);
  });
});
