import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { SalesEngine } from '../sales/SalesEngine';
import { newId } from '../utils/ids';
import { FinanceController } from '../controllers/financeController';

describe('Credit Note Applications, Refunds & Tenant Isolation API & Accounting Tests', () => {
  const orgA = 'org-cn-test-a';
  const orgB = 'org-cn-test-b';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    // Setup Organizations
    for (const org of [orgA, orgB]) {
      await db.query(
        `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
         VALUES ($1, $2, $3, $4, $5, 'India', 'INR', '₹', 'user-owner')
         ON CONFLICT (id) DO NOTHING`,
        [org, `uuid-${org}`, `pub-${org}`, org === orgA ? 'ORGA' : 'ORGB', `Test Org ${org}`]
      );

      // Seed core chart of accounts
      await db.query(`
        INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance)
        VALUES 
          ('acc-bank-${org}', '${org}', '1010', 'Bank Account', 'Asset', 'Bank', 50000.00),
          ('acc-ar-${org}', '${org}', '1100', 'Accounts Receivable', 'Asset', 'Accounts Receivable', 0.00),
          ('acc-rev-${org}', '${org}', '4000', 'Sales Revenue', 'Income', 'Sales', 0.00),
          ('acc-tax-${org}', '${org}', '2200', 'GST Output Tax', 'Liability', 'Tax Payable', 0.00)
        ON CONFLICT DO NOTHING;
      `);
    }
  });

  it('1. Enforces tenant isolation on getCreditNoteApplications', async () => {
    // Insert an application in Org A
    const cnIdA = newId('cn');
    const invIdA = newId('inv');
    const appIdA = newId('cna');

    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_id, client_name, issue_date, due_date, total_amount, balance_due, status)
       VALUES ($1, $2, 'INV-A-101', 'cust-a', 'Client A', '2026-09-01', '2026-09-30', 500, 500, 'Sent')`,
      [invIdA, orgA]
    );

    await db.query(
      `INSERT INTO credit_notes (id, organization_id, credit_note_number, client_id, client_name, date, total_amount, remaining_credit, status)
       VALUES ($1, $2, 'CN-A-001', 'cust-a', 'Client A', '2026-09-01', 500, 0, 'Closed')`,
      [cnIdA, orgA]
    );

    await db.query(
      `INSERT INTO credit_note_applications (id, organization_id, credit_note_id, invoice_id, amount_applied, applied_date)
       VALUES ($1, $2, $3, $4, 500, '2026-09-02')`,
      [appIdA, orgA, cnIdA, invIdA]
    );

    // Request from Org B must return empty list (zero cross-tenant leakage)
    const reqB: any = {
      auth: { organizationId: orgB, userId: 'usr-b' },
      query: {},
    };
    let jsonResultB: any = null;
    const resB: any = {
      json: (data: any) => {
        jsonResultB = data;
      },
    };

    await FinanceController.getCreditNoteApplications(reqB, resB);
    expect(jsonResultB).toHaveLength(0);

    // Request from Org A must return the application with joined invoice_number
    const reqA: any = {
      auth: { organizationId: orgA, userId: 'usr-a' },
      query: {},
    };
    let jsonResultA: any = null;
    const resA: any = {
      json: (data: any) => {
        jsonResultA = data;
      },
    };

    await FinanceController.getCreditNoteApplications(reqA, resA);
    expect(jsonResultA).toHaveLength(1);
    expect(jsonResultA[0].id).toBe(appIdA);
    expect(jsonResultA[0].invoice_number).toBe('INV-A-101');
    expect(Number(jsonResultA[0].amount_applied)).toBe(500);
  });

  it('2. Filters credit note applications by creditNoteId query param', async () => {
    const cn1 = newId('cn');
    const cn2 = newId('cn');
    const inv1 = newId('inv');
    const inv2 = newId('inv');

    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_id, client_name, issue_date, due_date, total_amount, balance_due, status)
       VALUES 
         ('${inv1}', '${orgA}', 'INV-001', 'cust-1', 'Client 1', '2026-09-01', '2026-09-30', 300, 0, 'Paid'),
         ('${inv2}', '${orgA}', 'INV-002', 'cust-1', 'Client 1', '2026-09-01', '2026-09-30', 400, 0, 'Paid')`
    );

    await db.query(
      `INSERT INTO credit_notes (id, organization_id, credit_note_number, client_id, client_name, date, total_amount, remaining_credit, status)
       VALUES 
         ('${cn1}', '${orgA}', 'CN-001', 'cust-1', 'Client 1', '2026-09-01', 300, 0, 'Closed'),
         ('${cn2}', '${orgA}', 'CN-002', 'cust-1', 'Client 1', '2026-09-01', 400, 0, 'Closed')`
    );

    await db.query(
      `INSERT INTO credit_note_applications (id, organization_id, credit_note_id, invoice_id, amount_applied, applied_date)
       VALUES 
         ('app-1', '${orgA}', '${cn1}', '${inv1}', 300, '2026-09-02'),
         ('app-2', '${orgA}', '${cn2}', '${inv2}', 400, '2026-09-03')`
    );

    const req: any = {
      auth: { organizationId: orgA, userId: 'usr-a' },
      query: { creditNoteId: cn1 },
    };
    let result: any = null;
    const res: any = {
      json: (data: any) => {
        result = data;
      },
    };

    await FinanceController.getCreditNoteApplications(req, res);
    expect(result).toHaveLength(1);
    expect(result[0].credit_note_id).toBe(cn1);
    expect(result[0].invoice_number).toBe('INV-001');
  });

  it('3. Executes full end-to-end lifecycle: Create -> Multi-Invoice Apply -> Refund -> GL Ledger Invariance', async () => {
    const customerId = 'cust-lifecycle-1';
    await db.query(
      `INSERT INTO customers (id, organization_id, display_name, email, currency)
       VALUES ($1, $2, 'Global Enterprises', 'global@example.com', 'INR')`,
      [customerId, orgA]
    );

    // 1. Create Invoices
    const inv1Id = newId('inv');
    const inv2Id = newId('inv');
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, customer_id, client_id, client_name, issue_date, due_date, total_amount, balance_due, status)
       VALUES 
         ('${inv1Id}', '${orgA}', 'INV-2026-501', '${customerId}', '${customerId}', 'Global Enterprises', '2026-09-01', '2026-09-30', 500.00, 500.00, 'Sent'),
         ('${inv2Id}', '${orgA}', 'INV-2026-502', '${customerId}', '${customerId}', 'Global Enterprises', '2026-09-05', '2026-10-05', 800.00, 800.00, 'Sent')`
    );

    // 2. Create Credit Note for $1000
    const createdNote = await SalesEngine.createCreditNote(orgA, {
      customerId,
      customerName: 'Global Enterprises',
      issueDate: '2026-09-10',
      amount: 1000.00,
      taxableAmount: 1000.00,
      taxAmount: 0,
      reason: '01 - Sales Return: Damaged transit goods',
    });

    expect(createdNote.creditNoteId).toBeDefined();

    // Verify initial balance
    const cnRow1 = await db.query('SELECT remaining_credit, status FROM credit_notes WHERE id = $1', [createdNote.creditNoteId]);
    expect(Number(cnRow1.rows[0].remaining_credit)).toBe(1000.00);
    expect(cnRow1.rows[0].status).toBe('Open');

    // 3. Apply $500 to Invoice 1 (full balance) and $300 to Invoice 2 (partial balance)
    const app1 = await SalesEngine.applyCreditNoteToInvoice(orgA, createdNote.creditNoteId, inv1Id, 500.00, '2026-09-11');
    expect(app1.appliedAmount).toBe(500.00);
    expect(app1.remainingCreditNoteBalance).toBe(500.00);

    const app2 = await SalesEngine.applyCreditNoteToInvoice(orgA, createdNote.creditNoteId, inv2Id, 300.00, '2026-09-11');
    expect(app2.appliedAmount).toBe(300.00);
    expect(app2.remainingCreditNoteBalance).toBe(200.00);

    // Verify Invoice 1 is now Paid, and Invoice 2 is Partially Paid with balance 500
    const inv1Check = await db.query('SELECT balance_due, amount_credited, status FROM invoices WHERE id = $1', [inv1Id]);
    expect(Number(inv1Check.rows[0].balance_due)).toBe(0.00);
    expect(Number(inv1Check.rows[0].amount_credited)).toBe(500.00);
    expect(inv1Check.rows[0].status).toBe('Paid');

    const inv2Check = await db.query('SELECT balance_due, amount_credited, status FROM invoices WHERE id = $1', [inv2Id]);
    expect(Number(inv2Check.rows[0].balance_due)).toBe(500.00);
    expect(Number(inv2Check.rows[0].amount_credited)).toBe(300.00);
    expect(inv2Check.rows[0].status).toBe('Partially Paid');

    // 4. Record Customer Refund for the remaining $200 to Bank Account
    const refundRes = await SalesEngine.recordRefund(orgA, {
      customerId,
      creditNoteId: createdNote.creditNoteId,
      refundDate: '2026-09-12',
      amount: 200.00,
      refundAccountId: `acc-bank-${orgA}`,
      reference: 'NEFT-REF-998877',
      notes: 'Customer requested direct bank refund for remaining credit',
    });

    expect(refundRes.refundId).toBeDefined();

    // Verify Credit Note is now Closed with 0 remaining balance
    const cnRowFinal = await db.query('SELECT remaining_credit, status FROM credit_notes WHERE id = $1', [createdNote.creditNoteId]);
    expect(Number(cnRowFinal.rows[0].remaining_credit)).toBe(0.00);
    expect(cnRowFinal.rows[0].status).toBe('Closed');

    // 5. Verify General Ledger entries equilibrium for the refund
    const refundRecord = await db.query('SELECT journal_entry_id FROM customer_refunds WHERE id = $1', [refundRes.refundId]);
    const jeId = refundRecord.rows[0].journal_entry_id;

    const glLines = await db.query('SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id = $1', [jeId]);
    expect(glLines.rows).toHaveLength(2);

    const totalDebit = glLines.rows.reduce((sum: number, r: any) => sum + Number(r.debit), 0);
    const totalCredit = glLines.rows.reduce((sum: number, r: any) => sum + Number(r.credit), 0);

    expect(totalDebit).toBe(200.00);
    expect(totalCredit).toBe(200.00);
    expect(totalDebit).toBe(totalCredit); // Double-Entry Invariance
  });

  it('4. Rejects invalid operations: cross-customer application and over-refunding', async () => {
    const cust1 = 'cust-1';
    const cust2 = 'cust-2';

    const cnId = newId('cn');
    const invIdCust2 = newId('inv');

    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, customer_id, client_id, client_name, issue_date, due_date, total_amount, balance_due, status)
       VALUES ('${invIdCust2}', '${orgA}', 'INV-CUST2', '${cust2}', '${cust2}', 'Client 2', '2026-09-01', '2026-09-30', 500, 500, 'Sent')`
    );

    await db.query(
      `INSERT INTO credit_notes (id, organization_id, credit_note_number, client_id, client_name, date, total_amount, remaining_credit, status)
       VALUES ('${cnId}', '${orgA}', 'CN-CUST1', '${cust1}', 'Client 1', '2026-09-01', 500, 500, 'Open')`
    );

    // Cross-customer allocation must be rejected
    await expect(
      SalesEngine.applyCreditNoteToInvoice(orgA, cnId, invIdCust2, 200, '2026-09-05')
    ).rejects.toThrow(/CROSS_CUSTOMER_ALLOCATION/);

    // Over-refund must be rejected
    await expect(
      SalesEngine.recordRefund(orgA, {
        customerId: cust1,
        creditNoteId: cnId,
        refundDate: '2026-09-05',
        amount: 800, // available is only 500
        refundAccountId: `acc-bank-${orgA}`,
      })
    ).rejects.toThrow(/exceeds remaining credit note balance/);
  });
});
