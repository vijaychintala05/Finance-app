import { beforeEach, describe, expect, it } from 'vitest';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { OrganizationProvisioningService } from '../services/OrganizationProvisioningService';
import { ProfitAndLossReportService } from '../services/ProfitAndLossReportService';

const ORG_ID = 'org-accounting-model';
const OTHER_ORG_ID = 'org-model-other';

async function createOrganization(id: string, code: string): Promise<void> {
  await db.query(
    `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
     VALUES ($1, $2, $3, $4, $5, 'India', 'INR', 'Rs', 'usr-accounting-model')`,
    [id, `uuid-${id}`, `public-${id}`, code, `Accounting model ${code}`]
  );
  await OrganizationProvisioningService.provisionDefaultChart(db, id);
}

describe('role-based chart of accounts and dimensional ledger', () => {
  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();
    await createOrganization(ORG_ID, 'ACCT');
  });

  it('provisions typed system roles and resolves them without relying on account names', async () => {
    const defaults = await db.query(
      `SELECT d.system_role, a.code, a.is_system_account, a.financial_statement
         FROM accounting_defaults d
         JOIN accounts a ON a.id = d.account_id AND a.organization_id = d.organization_id
        WHERE d.organization_id = $1`,
      [ORG_ID]
    );
    expect(defaults.rows.length).toBeGreaterThanOrEqual(18);
    expect(defaults.rows.find((row) => row.system_role === 'AR_CONTROL')?.code).toBe('1100');
    expect(defaults.rows.find((row) => row.system_role === 'DIRECT_COSTS')?.financial_statement).toBe('PROFIT_AND_LOSS');
    expect(defaults.rows.every((row) => row.is_system_account)).toBe(true);

    const salesId = await OrganizationProvisioningService.resolveSystemAccountId(db, ORG_ID, 'SALES_REVENUE', ['Income']);
    await db.query(`UPDATE accounts SET name = 'Renamed sales account' WHERE id = $1`, [salesId]);
    await expect(OrganizationProvisioningService.resolveSystemAccountId(db, ORG_ID, 'SALES_REVENUE', ['Income']))
      .resolves.toBe(salesId);
  });

  it('uses configured normal balances and retains tenant-safe dimensions on journal lines', async () => {
    const bankId = await OrganizationProvisioningService.resolveSystemAccountId(db, ORG_ID, 'BANK_OPERATING', ['Asset']);
    const directCostId = await OrganizationProvisioningService.resolveSystemAccountId(db, ORG_ID, 'DIRECT_COSTS', ['Expense']);
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, normal_balance, normal_balance_is_explicit, status)
       VALUES ('acc-contra', $1, '1790', 'Accumulated Depreciation', 'Asset', 'Accumulated Depreciation', 0, 'Credit', TRUE, 'Active')`,
      [ORG_ID]
    );
    await db.query(
      `INSERT INTO clients (id, organization_id, name, currency) VALUES ('cli-model', $1, 'Model client', 'INR')`,
      [ORG_ID]
    );
    await db.query(
      `INSERT INTO vendors (id, organization_id, name, currency) VALUES ('ven-model', $1, 'Model vendor', 'INR')`,
      [ORG_ID]
    );
    await db.query(
      `INSERT INTO projects (id, organization_id, code, name, client_id) VALUES ('prj-model', $1, 'MODEL-1', 'Model project', 'cli-model')`,
      [ORG_ID]
    );

    await ServerPostingEngine.postEntry({
      organizationId: ORG_ID,
      entryNumber: 'JE-MODEL-001',
      date: '2026-09-01',
      description: 'Direct cost with dimensions',
      lines: [
        { accountId: directCostId, debit: 250, credit: 0, projectId: 'prj-model', customerId: 'cli-model', vendorId: 'ven-model' },
        { accountId: bankId, debit: 0, credit: 250, projectId: 'prj-model', customerId: 'cli-model', vendorId: 'ven-model' },
      ],
    });
    await ServerPostingEngine.postEntry({
      organizationId: ORG_ID,
      entryNumber: 'JE-MODEL-002',
      date: '2026-09-01',
      description: 'Contra asset balance',
      lines: [
        { accountId: bankId, debit: 10, credit: 0 },
        { accountId: 'acc-contra', debit: 0, credit: 10 },
      ],
    });

    const dimensionalLine = await db.query(
      `SELECT project_id, customer_id, vendor_id FROM journal_lines WHERE journal_entry_id =
       (SELECT id FROM journal_entries WHERE organization_id = $1 AND entry_number = 'JE-MODEL-001') LIMIT 1`,
      [ORG_ID]
    );
    expect(dimensionalLine.rows[0]).toMatchObject({ project_id: 'prj-model', customer_id: 'cli-model', vendor_id: 'ven-model' });
    const contra = await db.query(`SELECT balance FROM accounts WHERE id = 'acc-contra'`);
    expect(Number(contra.rows[0].balance)).toBe(10);

    const pnl = await ProfitAndLossReportService.getProfitAndLoss(ORG_ID, { projectId: 'prj-model' });
    expect(pnl.totalDirectCost).toBe(250);
    expect(pnl.grossProfit).toBe(-250);

    await createOrganization(OTHER_ORG_ID, 'OTHER');
    await db.query(
      `INSERT INTO projects (id, organization_id, code, name) VALUES ('prj-other', $1, 'OTHER-1', 'Other project')`,
      [OTHER_ORG_ID]
    );
    await expect(ServerPostingEngine.postEntry({
      organizationId: ORG_ID,
      entryNumber: 'JE-MODEL-003',
      date: '2026-09-01',
      description: 'Cross-tenant dimension must fail',
      lines: [
        { accountId: directCostId, debit: 1, credit: 0, projectId: 'prj-other' },
        { accountId: bankId, debit: 0, credit: 1 },
      ],
    })).rejects.toThrow('does not belong to this organization');
  });
});
