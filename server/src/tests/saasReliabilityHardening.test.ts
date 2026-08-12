import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { DocumentNumberingEngine } from '../services/DocumentNumberingEngine';
import { BudgetService } from '../services/BudgetService';
import { RecurringJournalService } from '../services/RecurringJournalService';
import { SavedReportService } from '../services/SavedReportService';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { getJwtSecret, isProduction } from '../config/environment';
import { newId } from '../utils/ids';
import { ManualJournalService } from '../services/ManualJournalService';
import { OrganizationProvisioningService } from '../services/OrganizationProvisioningService';
import { SalesEngine } from '../sales/SalesEngine';
import { ServerPostingEngine } from '../accounting/postingEngine';

describe('SaaS reliability hardening', () => {
  const orgId = newId('org-trust');
  const userId = newId('usr-trust');
  const otherUserId = newId('usr-other');
  const debitAccountId = newId('acc-exp');
  const creditAccountId = newId('acc-bank');

  beforeAll(async () => {
    await MigrationRunner.runMigrations();
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES ($1, $2, '6100-TRUST', 'Reliability Expense', 'Expense', 'Operating Expense', 0, 'Active')`,
      [debitAccountId, orgId]
    );
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES ($1, $2, '1010-TRUST', 'Reliability Bank', 'Asset', 'Bank', 0, 'Active')`,
      [creditAccountId, orgId]
    );
  });

  it('creates every schema used by advertised planning and close read APIs', async () => {
    for (const table of [
      'accounting_period_closes',
      'recurring_journal_profiles',
      'budgets',
      'budget_lines',
      'saved_reports',
      'fixed_assets',
      'fixed_asset_depreciation_entries',
    ]) {
      const result = await db.query(`SELECT COUNT(*) AS count FROM ${table}`);
      expect(result.rows).toHaveLength(1);
    }
  });

  it('document-number preview is read-only and allocation remains authoritative', async () => {
    await DocumentNumberingEngine.configureSequence(orgId, {
      documentType: 'INVOICE',
      prefix: 'INV-TRUST',
      financialYear: '2026-27',
      paddingLength: 4,
    });

    const firstPreview = await DocumentNumberingEngine.previewNextNumber(orgId, 'INVOICE', '2026-08-11');
    const secondPreview = await DocumentNumberingEngine.previewNextNumber(orgId, 'INVOICE', '2026-08-11');
    expect(secondPreview).toBe(firstPreview);

    const allocated = await DocumentNumberingEngine.getNextNumber(orgId, 'INVOICE', '2026-08-11');
    expect(allocated).toBe(firstPreview);
    expect(await DocumentNumberingEngine.previewNextNumber(orgId, 'INVOICE', '2026-08-11')).toContain('0002');
  });

  it('rolls document-number allocation back with a failed financial transaction', async () => {
    const before = await DocumentNumberingEngine.previewNextNumber(orgId, 'EXPENSE', '2026-08-11');
    await expect(db.transaction(async (client) => {
      await DocumentNumberingEngine.getNextNumber(orgId, 'EXPENSE', '2026-08-11', undefined, client);
      throw new Error('simulated posting validation failure');
    })).rejects.toThrow(/validation failure/);
    expect(await DocumentNumberingEngine.previewNextNumber(orgId, 'EXPENSE', '2026-08-11')).toBe(before);
  });

  it('keeps contra-normal expense account types debit-normal', async () => {
    const otherExpenseId = newId('acc-other-expense');
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES ($1, $2, '6900-TRUST', 'Other Reliability Expense', 'Other Expense', 'Other Expenses', 0, 'Active')`,
      [otherExpenseId, orgId]
    );
    await ServerPostingEngine.postEntry({
      organizationId: orgId,
      entryNumber: `JRN-OTHER-${Date.now()}`,
      date: '2026-08-11',
      description: 'Verify debit-normal other expense balance behavior',
      lines: [
        { accountId: otherExpenseId, debit: 25.5, credit: 0 },
        { accountId: creditAccountId, debit: 0, credit: 25.5 },
      ],
    });
    const result = await db.query('SELECT balance FROM accounts WHERE organization_id = $1 AND id = $2', [orgId, otherExpenseId]);
    expect(Number(result.rows[0].balance)).toBe(25.5);
  });

  it('rejects unsafe numbering configuration', async () => {
    await expect(DocumentNumberingEngine.configureSequence(orgId, {
      documentType: 'INVOICE;DROP',
      prefix: '../invoice',
      paddingLength: 99,
    })).rejects.toThrow();
  });

  it('validates and atomically audits tenant budget data', async () => {
    await expect(BudgetService.createBudget(orgId, userId, {
      name: 'Invalid Cross-Tenant Budget',
      financialYear: '2026-27',
      lines: [{ accountId: newId('foreign-account'), periodKey: '2026-04', amount: 100 }],
    })).rejects.toThrow(/does not belong/);

    const budget = await BudgetService.createBudget(orgId, userId, {
      name: 'Reliability Budget',
      financialYear: '2026-27',
      lines: [{ accountId: debitAccountId, periodKey: '2026-04', amount: 1250.25 }],
    });
    const persisted = await db.query('SELECT id FROM budgets WHERE organization_id = $1 AND id = $2', [orgId, budget.id]);
    const audit = await db.query("SELECT id FROM audit_logs WHERE organization_id = $1 AND entity_id = $2 AND action = 'BUDGET_CREATED'", [orgId, budget.id]);
    expect(persisted.rows).toHaveLength(1);
    expect(audit.rows).toHaveLength(1);
  });

  it('accepts only balanced, tenant-account recurring journal templates', async () => {
    await expect(RecurringJournalService.createProfile(orgId, userId, {
      name: 'Unbalanced Profile',
      frequency: 'MONTHLY',
      startDate: '2026-08-01',
      journalTemplate: { lines: [{ accountId: debitAccountId, debit: 100, credit: 0 }, { accountId: creditAccountId, debit: 0, credit: 99 }] },
    })).rejects.toThrow(/balanced/);

    const profile = await RecurringJournalService.createProfile(orgId, userId, {
      name: 'Monthly Accrual',
      frequency: 'MONTHLY',
      startDate: '2026-08-01',
      journalTemplate: { lines: [{ accountId: debitAccountId, debit: 100, credit: 0 }, { accountId: creditAccountId, debit: 0, credit: 100 }] },
    });
    expect((await db.query('SELECT id FROM recurring_journal_profiles WHERE organization_id = $1 AND id = $2', [orgId, profile.id])).rows).toHaveLength(1);
  });

  it('keeps saved reports private by default and owner-controlled', async () => {
    const report = await SavedReportService.saveReport(orgId, userId, {
      name: 'Private Cash View',
      reportType: 'cash_flow',
      config: { fromDate: '2026-04-01' },
    });
    const row = await db.query('SELECT visibility FROM saved_reports WHERE organization_id = $1 AND id = $2', [orgId, report.id]);
    expect(row.rows[0].visibility).toBe('PRIVATE');
    await expect(SavedReportService.toggleFavorite(orgId, otherUserId, report.id)).rejects.toThrow(/not owned/);
    expect(await SavedReportService.toggleFavorite(orgId, userId, report.id)).toBe(true);
  });

  it('rejects unjournaled vendor balances before any write', async () => {
    await expect(PurchasesEngine.createVendor(orgId, { name: 'Unsafe Vendor', openingBalance: 500 })).rejects.toThrow(/balanced financial transactions/);
  });

  it('does not let a test-runner flag weaken production secret rules', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalVitest = process.env.VITEST;
    const originalSecret = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      process.env.VITEST = 'true';
      delete process.env.JWT_SECRET;
      expect(isProduction()).toBe(true);
      expect(() => getJwtSecret()).toThrow(/required in production/);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      process.env.VITEST = originalVitest;
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it('prevents manual journals from bypassing control-account subledgers', async () => {
    const ar = newId('acc-ar-test');
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES ($1, $2, '1100', 'AR Control Test', 'Asset', 'Accounts Receivable', 0, 'Active')`,
      [ar, orgId]
    );
    await expect(ManualJournalService.createJournal(orgId, userId, {
      date: '2026-08-11',
      narration: 'Attempted direct receivable adjustment with detailed narration',
      lines: [
        { accountId: ar, customerId: newId('cust'), debit: 100, credit: 0 },
        { accountId: creditAccountId, debit: 0, credit: 100 },
      ],
    })).rejects.toThrow(/CONTROL_ACCOUNT_RESTRICTED/);
  });

  it('posts invoices to tenant-scoped control accounts in a freshly provisioned chart', async () => {
    const freshOrgId = newId('org-fresh');
    const customerId = newId('cus-fresh');
    await db.transaction(async (client) => {
      await client.query(
        `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
         VALUES ($1, $2, $3, $4, 'Fresh Tenant', 'Test Jurisdiction', 'USD', 'USD', $5)`,
        [freshOrgId, newId('uuid'), `PUB-${freshOrgId.slice(-12)}`, `ORG-${freshOrgId.slice(-8)}`, userId]
      );
      await OrganizationProvisioningService.provisionDefaultChart(client, freshOrgId);
      await client.query(
        `INSERT INTO clients (id, organization_id, name, email, currency)
         VALUES ($1, $2, 'Fresh Tenant Customer', 'fresh@example.test', 'USD')`,
        [customerId, freshOrgId]
      );
    });

    const invoice = await SalesEngine.createAndPostInvoice(freshOrgId, {
      customerId,
      issueDate: '2026-08-11',
      dueDate: '2026-09-10',
      createdBy: userId,
      lineItems: [{ description: 'Verified service', quantity: 1, unitPrice: 100, taxRate: 18 }],
    });

    const posting = await db.query(
      `SELECT a.organization_id, a.code, a.balance
         FROM journal_lines jl
         JOIN accounts a ON a.id = jl.account_id
        WHERE jl.journal_entry_id = $1
        ORDER BY a.code`,
      [invoice.journalEntryId]
    );
    expect(posting.rows.map((row) => row.organization_id)).toEqual([freshOrgId, freshOrgId, freshOrgId]);
    expect(posting.rows.map((row) => row.code)).toEqual(['1100', '2200', '4000']);
    expect(Number(posting.rows.find((row) => row.code === '1100')?.balance)).toBe(118);
    expect(Number(posting.rows.find((row) => row.code === '2200')?.balance)).toBe(18);
    expect(Number(posting.rows.find((row) => row.code === '4000')?.balance)).toBe(100);
  });
});
