import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../database/db';
import { newId } from '../utils/ids';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';
import { TrialBalanceReportService } from '../services/TrialBalanceReportService';
import { ProfitAndLossReportService } from '../services/ProfitAndLossReportService';
import { BalanceSheetReportService } from '../services/BalanceSheetReportService';
import { PeriodCloseService } from '../services/PeriodCloseService';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { ServerPostingEngine } from '../accounting/postingEngine';

describe('Gate 6: Period Boundaries, Historical Stability & Project Reconciliation Suite', () => {
  const ORG_ID = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
  const OWNER_ID = MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.owner.id;

  const customerId = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id;
  const vendorId = MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id;
  const projectId = MASTER_FIXTURE_CONSTANTS.PROJECTS.A.id;

  let invoiceM1Id: string;
  let invoiceM2Id: string;

  beforeAll(async () => {
    await MasterFinanceFixture.reset();

    // 1. Month 1 (April 2026): Initial Capital & Transactions
    const bankAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1010'`, [ORG_ID])).rows[0].id;
    const capAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '3000'`, [ORG_ID])).rows[0].id;

    await ServerPostingEngine.postEntry({
      organizationId: ORG_ID,
      entryNumber: 'JE-CAPITAL-01',
      date: '2026-04-01',
      description: 'Initial Share Capital',
      lines: [
        { accountId: bankAcc, debit: 1000000.00, credit: 0, description: 'Bank Capital' },
        { accountId: capAcc, debit: 0, credit: 1000000.00, description: 'Share Capital' },
      ],
    });

    // Month 1 Sales Invoice: 100,000 + 18% GST (18,000) on 2026-04-15 linked to Project
    const invM1 = await SalesEngine.createAndPostInvoice(ORG_ID, {
      invoiceNumber: 'INV-M1-001',
      customerId,
      issueDate: '2026-04-15',
      projectId,
      subtotal: 100000.00,
      taxTotal: 18000.00,
      totalAmount: 118000.00,
      lineItems: [
        {
          id: newId('inv-item'),
          description: 'Project Architecture Phase 1',
          quantity: 1,
          unitPrice: 100000.00,
          taxRate: 18,
          taxAmount: 18000.00,
          totalAmount: 118000.00,
        },
      ],
    });
    invoiceM1Id = invM1.id;

    // Month 1 Vendor Bill: 40,000 + 18% GST (7,200) on 2026-04-20
    await PurchasesEngine.createAndPostBill(ORG_ID, {
      billNumber: 'BILL-M1-001',
      vendorId,
      billDate: '2026-04-20',
      subtotal: 40000.00,
      taxTotal: 7200.00,
      totalAmount: 47200.00,
      lineItems: [
        {
          id: newId('bill-item'),
          description: 'Phase 1 Structural Materials',
          quantity: 1,
          unitPrice: 40000.00,
          taxRate: 18,
          taxAmount: 7200.00,
          totalAmount: 47200.00,
        },
      ],
    });

    // Seed direct project expenses and billable time entries in Month 1
    await db.query(
      `INSERT INTO expenses (id, organization_id, expense_number, expense_account_id, paid_from_account_id, project_id, amount, date, status, description, created_at)
       VALUES
       ('${newId('exp')}', '${ORG_ID}', 'EXP-M1-001', '6000', '1010', '${projectId}', 12500.00, '2026-04-22', 'POSTED', 'Site Survey Expense', NOW()),
       ('${newId('exp')}', '${ORG_ID}', 'EXP-M1-002', '6000', '1010', '${projectId}', 7500.00, '2026-04-25', 'POSTED', 'Structural Testing Expense', NOW())`
    );

    await db.query(
      `INSERT INTO time_entries (id, organization_id, project_id, project_name, staff_name, task_name, date, hours, hourly_rate, is_billable, is_billed, description)
       VALUES
       ('${newId('time')}', '${ORG_ID}', '${projectId}', 'Executive Suite', 'Lead Architect', 'Design Draft', '2026-04-10', 20, 1500.00, TRUE, FALSE, 'Architectural Blueprints'),
       ('${newId('time')}', '${ORG_ID}', '${projectId}', 'Executive Suite', 'Senior Engineer', 'Site Review', '2026-04-12', 15, 1200.00, TRUE, FALSE, 'Site Engineering Review')`
    );
  });

  // =========================================================================
  // 1. PERIOD DATE-FILTERING & HISTORICAL STABILITY
  // =========================================================================
  describe('1. Period Date-Filtering & Historical Statement Invariants', () => {
    it('generates Month 1 P&L and Trial Balance accurately', async () => {
      const pnlM1 = await ProfitAndLossReportService.getProfitAndLoss(ORG_ID, {
        fromDate: '2026-04-01',
        toDate: '2026-04-30',
      });

      expect(pnlM1.totalRevenue).toBe(100000.00);
      expect(pnlM1.totalExpenses).toBe(40000.00);
      expect(pnlM1.netProfit).toBe(60000.00);

      const tbM1 = await TrialBalanceReportService.getTrialBalance(ORG_ID, {
        toDate: '2026-04-30',
      });

      expect(tbM1.isBalanced).toBe(true);
      expect(tbM1.difference).toBe(0);
    });

    it('posts Month 2 transactions and proves Month 1 historical reports remain 100% stable', async () => {
      // Month 2 (May 2026): Post new Invoice of 200,000 + 18% GST (36,000)
      const invM2 = await SalesEngine.createAndPostInvoice(ORG_ID, {
        invoiceNumber: 'INV-M2-001',
        customerId,
        issueDate: '2026-05-10',
        projectId,
        subtotal: 200000.00,
        taxTotal: 36000.00,
        totalAmount: 236000.00,
        lineItems: [
          {
            id: newId('inv-item'),
            description: 'Project Construction Phase 2',
            quantity: 1,
            unitPrice: 200000.00,
            taxRate: 18,
            taxAmount: 36000.00,
            totalAmount: 236000.00,
          },
        ],
      });
      invoiceM2Id = invM2.id;

      // Re-query Month 1 (April 2026) P&L — Must remain EXACTLY identical!
      const pnlM1After = await ProfitAndLossReportService.getProfitAndLoss(ORG_ID, {
        fromDate: '2026-04-01',
        toDate: '2026-04-30',
      });

      expect(pnlM1After.totalRevenue).toBe(100000.00);
      expect(pnlM1After.totalExpenses).toBe(40000.00);
      expect(pnlM1After.netProfit).toBe(60000.00);

      // Query Month 2 (May 2026) P&L
      const pnlM2 = await ProfitAndLossReportService.getProfitAndLoss(ORG_ID, {
        fromDate: '2026-05-01',
        toDate: '2026-05-31',
      });

      expect(pnlM2.totalRevenue).toBe(200000.00);

      // Query Combined Q1 (April - May) P&L
      const pnlCombined = await ProfitAndLossReportService.getProfitAndLoss(ORG_ID, {
        fromDate: '2026-04-01',
        toDate: '2026-05-31',
      });

      expect(pnlCombined.totalRevenue).toBe(300000.00);
      expect(pnlCombined.totalExpenses).toBe(40000.00);
      expect(pnlCombined.netProfit).toBe(260000.00);
    });
  });

  // =========================================================================
  // 2. PERIOD LOCKING & MUTATION DEFENSE
  // =========================================================================
  describe('2. Period Locking & Backdated Mutation Defense', () => {
    it('locks April 2026 period and rejects any backdated transactions in locked period', async () => {
      // Lock April 2026
      await db.query(
        `INSERT INTO period_locks (id, organization_id, period_name, is_locked, lock_date, status, locked_by, locked_at)
         VALUES ('lock-apr-2026', $1, '2026-04', TRUE, '2026-04-30', 'Active', 'system', NOW())`,
        [ORG_ID]
      );

      // Attempting to post an invoice in April 2026 must be rejected!
      await expect(
        SalesEngine.createAndPostInvoice(ORG_ID, {
          invoiceNumber: 'INV-BACKDATED',
          customerId,
          issueDate: '2026-04-20',
          subtotal: 10000.00,
          taxTotal: 1800.00,
          totalAmount: 11800.00,
          lineItems: [
            {
              id: newId('inv-item'),
              description: 'Backdated Invoice',
              quantity: 1,
              unitPrice: 10000.00,
              taxRate: 18,
              taxAmount: 1800.00,
              totalAmount: 11800.00,
            },
          ],
        })
      ).rejects.toThrow(/locked/i);

      // Posting in May 2026 (after lock date) succeeds!
      const postMay = await SalesEngine.createAndPostInvoice(ORG_ID, {
        invoiceNumber: 'INV-MAY-OK',
        customerId,
        issueDate: '2026-05-15',
        subtotal: 10000.00,
        taxTotal: 1800.00,
        totalAmount: 11800.00,
        lineItems: [
          {
            id: newId('inv-item'),
            description: 'May Invoice After Lock',
            quantity: 1,
            unitPrice: 10000.00,
            taxRate: 18,
            taxAmount: 1800.00,
            totalAmount: 11800.00,
          },
        ],
      });
      expect(postMay).toBeDefined();
    });
  });

  // =========================================================================
  // 3. PROJECT PROFITABILITY & WIP RECONCILIATION
  // =========================================================================
  describe('3. Project Profitability & Unbilled Time Reconciliation', () => {
    it('reconciles project revenue, direct expenses, net profit, and unbilled WIP hours', async () => {
      const [projects, invoices, expenses, timeEntries] = await Promise.all([
        db.query(`SELECT id, budget_type, total_budget FROM projects WHERE organization_id = $1 AND id = $2`, [ORG_ID, projectId]),
        db.query(`SELECT project_id, total_amount, paid_amount FROM invoices WHERE organization_id = $1 AND project_id = $2 AND status NOT IN ('VOID', 'VOIDED')`, [ORG_ID, projectId]),
        db.query(`SELECT project_id, amount FROM expenses WHERE organization_id = $1 AND project_id = $2 AND status <> 'VOIDED'`, [ORG_ID, projectId]),
        db.query(`SELECT project_id, hours, hourly_rate, is_billable, is_billed FROM time_entries WHERE organization_id = $1 AND project_id = $2`, [ORG_ID, projectId]),
      ]);

      const totalInvoiced = invoices.rows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
      const directExpenses = expenses.rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const totalLoggedHours = timeEntries.rows.reduce((sum, r) => sum + Number(r.hours || 0), 0);
      const unbilledWip = timeEntries.rows
        .filter((r) => r.is_billable && !r.is_billed)
        .reduce((sum, r) => sum + Number(r.hours || 0) * Number(r.hourly_rate || 0), 0);

      // Invoiced: INV-M1 (118,000) + INV-M2 (236,000) = 354,000
      expect(totalInvoiced).toBe(354000.00);

      // Direct Expenses: 12,500 + 7,500 = 20,000
      expect(directExpenses).toBe(20000.00);

      // Net Profit: 354,000 - 20,000 = 334,000
      const netProfit = totalInvoiced - directExpenses;
      expect(netProfit).toBe(334000.00);

      // Logged Hours: 20h + 15h = 35h
      expect(totalLoggedHours).toBe(35);

      // Unbilled WIP Value: (20 * 1500) + (15 * 1200) = 30,000 + 18,000 = 48,000
      expect(unbilledWip).toBe(48000.00);
    });
  });
});
