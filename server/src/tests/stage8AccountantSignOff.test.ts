import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { OrganizationProvisioningService } from '../services/OrganizationProvisioningService';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { SalesEngine } from '../sales/SalesEngine';
import { AccountantSignOffAuditService } from '../services/AccountantSignOffAuditService';

describe('Stage 8: Accountant Sign-off & Audit Qualification Suite', () => {
  const ORG_SIGN_OFF = `org_signoff_${Date.now()}`;
  const USER_SIGN_OFF = `usr_signoff_${Date.now()}`;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();

    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, $2, $3, $4, 'Active') ON CONFLICT DO NOTHING`,
      [USER_SIGN_OFF, `auditor_${Date.now()}@firmbooks.com`, 'secure_hash', 'Chief Financial Controller']
    );

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [ORG_SIGN_OFF, `uuid_${ORG_SIGN_OFF}`, `pub_${ORG_SIGN_OFF}`, 'AUDIT', 'Audit Qualification Global LLC', 'US', 'USD', '$', USER_SIGN_OFF]
    );

    await OrganizationProvisioningService.provisionDefaultChart(db, ORG_SIGN_OFF);

    // Seed Opening Balances:
    // Debit Bank (1010) $10,000, Credit Owner's Equity (3000) $10,000
    const bankAcc = await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1000'`, [ORG_SIGN_OFF]);
    const equityAcc = await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '3000'`, [ORG_SIGN_OFF]);

    await ServerPostingEngine.postEntry({
      organizationId: ORG_SIGN_OFF,
      entryNumber: 'OPEN-001',
      date: '2026-01-01',
      description: 'Initial Opening Balance - Capital Injection',
      reference: 'OPEN-001',
      lines: [
        { accountId: bankAcc.rows[0].id, debit: 10000.0, credit: 0.0, description: 'Initial Cash Deposit' },
        { accountId: equityAcc.rows[0].id, debit: 0.0, credit: 10000.0, description: 'Owner Capital' },
      ],
    });

    // Create a verified Customer and post an invoice with payment
    const custRes = await db.query(
      `INSERT INTO customers (id, organization_id, display_name, email, currency)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [`cust_signoff_${Date.now()}`, ORG_SIGN_OFF, 'Global Enterprise Partner', 'partner@enterprise.com', 'USD']
    );
    const customerId = custRes.rows[0].id;

    const invoice = await SalesEngine.createAndPostInvoice(
      ORG_SIGN_OFF,
      {
        customerId,
        clientName: 'Global Enterprise Partner',
        issueDate: '2026-02-01',
        dueDate: '2026-02-28',
        lineItems: [
          { description: 'Quarterly Advisory Retainer', quantity: 1, unitPrice: 2000.0, taxRate: 0 },
        ],
      },
      USER_SIGN_OFF
    );

    expect(invoice.id).toBeDefined();
  }, 30000);

  it('1. Conducts complete mathematical audit and issues formal QUALIFIED certification', async () => {
    const report = await AccountantSignOffAuditService.conductSignOffAudit(
      ORG_SIGN_OFF,
      'Eleanor Vance, CPA - Lead Auditor'
    );

    expect(report.organizationId).toBe(ORG_SIGN_OFF);
    expect(report.auditorName).toBe('Eleanor Vance, CPA - Lead Auditor');
    expect(report.isQualified).toBe(true);
    expect(report.status).toBe('QUALIFIED');
    expect(report.failedAssertionsCount).toBe(0);
    expect(report.passedAssertionsCount).toBe(report.totalAssertionsChecked);
    expect(report.financialSummary.imbalance).toBe(0);
    expect(report.financialSummary.bsEquilibriumDifference).toBeLessThanOrEqual(0.05);
    expect(report.auditCertificationStatement).toContain('ZERO unresolved discrepancies');

    // Verify all 4 audit assertion categories exist and are passing
    const categories = new Set(report.assertions.map(a => a.category));
    expect(categories.has('GENERAL_LEDGER')).toBe(true);
    expect(categories.has('SUBLEDGER_PARITY')).toBe(true);
    expect(categories.has('FINANCIAL_STATEMENTS')).toBe(true);
    expect(categories.has('PERIOD_CONTROLS')).toBe(true);
  });

  it('2. Correctly flags DISQUALIFIED if an intentional balance anomaly or imbalance is introduced', async () => {
    // Create a temporary corrupted organization
    const CORRUPT_ORG = `org_corrupt_${Date.now()}`;
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [CORRUPT_ORG, `uuid_${CORRUPT_ORG}`, `pub_${CORRUPT_ORG}`, 'CORRUPT', 'Corrupt Entity Corp', 'US', 'USD', '$', USER_SIGN_OFF]
    );
    await OrganizationProvisioningService.provisionDefaultChart(db, CORRUPT_ORG);

    const bankAcc = await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1000'`, [CORRUPT_ORG]);
    const equityAcc = await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '3000'`, [CORRUPT_ORG]);

    // Force an unbalanced journal entry bypassing posting engine validation via raw DB insert
    const jeId = `je_corrupt_${Date.now()}`;
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, description, status)
       VALUES ($1, $2, $3, '2026-03-01', 'Corrupt Unbalanced Entry', 'POSTED')`,
      [jeId, CORRUPT_ORG, 'CORRUPT-001']
    );

    // Debit 500, Credit 400 (Unbalanced by $100)
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description)
       VALUES ($1, $2, $3, 500.0, 0.0, 'Corrupt line 1'),
              ($4, $2, $5, 0.0, 400.0, 'Corrupt line 2')`,
      [`jl_c1_${Date.now()}`, jeId, bankAcc.rows[0].id, `jl_c2_${Date.now()}`, equityAcc.rows[0].id]
    );

    const report = await AccountantSignOffAuditService.conductSignOffAudit(
      CORRUPT_ORG,
      'Eleanor Vance, CPA - Lead Auditor'
    );

    expect(report.isQualified).toBe(false);
    expect(report.status).toBe('DISQUALIFIED');
    expect(report.failedAssertionsCount).toBeGreaterThan(0);
    expect(report.auditCertificationStatement).toContain('AUDIT FAILED');
  });
});
