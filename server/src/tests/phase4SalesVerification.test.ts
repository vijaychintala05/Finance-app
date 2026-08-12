import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { SalesEngine } from '../sales/SalesEngine';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';

describe('Phase 4: Sales and Accounts Receivable Hardened Test Suite', () => {
  const ORG_ID = 'org-sales-test-123';
  const ORG_B = 'org-sales-test-456';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    await db.query(`
      INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
      VALUES
        ('${ORG_ID}', 'uuid-sales-a', 'PUB-SALES-A', 'SALES-A', 'Sales Test A', 'Test Jurisdiction', 'INR', 'INR', 'test-owner'),
        ('${ORG_B}', 'uuid-sales-b', 'PUB-SALES-B', 'SALES-B', 'Sales Test B', 'Test Jurisdiction', 'INR', 'INR', 'test-owner')
      ON CONFLICT DO NOTHING;
    `);

    // Seed GL Control accounts
    await db.query(`
      INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance)
      VALUES 
        ('acc-ar-control', '${ORG_ID}', '1100', 'Accounts Receivable', 'Asset', 'Accounts Receivable', 0.00),
        ('acc-sales-rev', '${ORG_ID}', '4000', 'Sales Revenue', 'Revenue', 'Sales Revenue', 0.00),
        ('acc-gst-output', '${ORG_ID}', '2200', 'GST Output Liability', 'Liability', 'GST Output Liability', 0.00),
        ('acc-bank-1', '${ORG_ID}', '1010', 'HDFC Bank Account', 'Asset', 'Cash and Cash Equivalents', 0.00),
        ('acc-customer-advances', '${ORG_ID}', '2100', 'Customer Advances Liability', 'Liability', 'Other Current Liabilities', 0.00),
        ('acc-bad-debt', '${ORG_ID}', '5800', 'Bad Debt Expense', 'Expense', 'Operating Expense', 0.00),
        ('acc-ar-control', '${ORG_B}', '1100', 'Accounts Receivable', 'Asset', 'Accounts Receivable', 0.00)
      ON CONFLICT DO NOTHING;
    `);
  });

  // -------------------------------------------------------------
  // 1. SALES GOLDEN TEST (REQUIREMENT 60)
  // -------------------------------------------------------------
  it('1. Sales Golden Test: Invoice -> Payment 1 -> Credit Note -> Payment 2 -> Write-Off', async () => {
    // 1. Create Customer
    const cust = await SalesEngine.createCustomer(ORG_ID, {
      displayName: 'Acme Enterprises',
      email: 'acme@example.com',
      gstin: '27AAAAA0000A1Z5',
    });

    // 2. Issue Invoice: ₹118,000 (Taxable ₹100,000 + GST ₹18,000)
    const inv = await SalesEngine.createAndPostInvoice(ORG_ID, {
      customerId: cust.id,
      customerName: cust.displayName,
      issueDate: '2026-04-10',
      dueDate: '2026-05-10',
      status: 'POSTED',
      lineItems: [
        { description: 'Consulting Services', quantity: 1, unitPrice: 100000, taxRate: 18, amount: 100000 },
      ],
    });

    expect(inv.totalAmount).toBe(118000);
    expect(inv.balanceDue).toBe(118000);

    // 3. Payment 1: ₹40,000
    await SalesEngine.recordPayment(ORG_ID, {
      customerId: cust.id,
      customerName: cust.displayName,
      paymentDate: '2026-04-15',
      amount: 40000,
      paymentMode: 'Bank Transfer',
      depositToAccountId: 'acc-bank-1',
      allocations: [{ invoiceId: inv.id, amount: 40000 }],
    });

    // 4. Credit Note: ₹11,800 (Taxable ₹10,000 + GST ₹1,800) applied to invoice
    const cn = await SalesEngine.createCreditNote(ORG_ID, {
      customerId: cust.id,
      customerName: cust.displayName,
      invoiceId: inv.id,
      date: '2026-04-20',
      taxableAmount: 10000,
      taxAmount: 1800,
      reason: 'Service Discount',
    });
    expect(cn.totalAmount).toBe(11800);

    // 5. Payment 2: ₹60,000
    await SalesEngine.recordPayment(ORG_ID, {
      customerId: cust.id,
      customerName: cust.displayName,
      paymentDate: '2026-04-25',
      amount: 60000,
      paymentMode: 'Bank Transfer',
      depositToAccountId: 'acc-bank-1',
      allocations: [{ invoiceId: inv.id, amount: 60000 }],
    });

    // Remaining balance before write-off: 118,000 - 40,000 - 11,800 - 60,000 = 6,200
    const invCheck = await db.query(`SELECT balance_due, paid_amount, amount_credited FROM invoices WHERE id = $1`, [inv.id]);
    expect(Number(invCheck.rows[0].balance_due)).toBe(6200);

    // 6. Write-off: ₹6,200
    await SalesEngine.recordWriteOff(ORG_ID, {
      invoiceId: inv.id,
      customerId: cust.id,
      writeOffDate: '2026-04-30',
      amount: 6200,
      writeOffAccountId: 'acc-bad-debt',
      reason: 'Small Balance Clearance',
    });

    // Final Invoice Balance must be ZERO
    const invFinal = await db.query(`SELECT balance_due, status FROM invoices WHERE id = $1`, [inv.id]);
    expect(Number(invFinal.rows[0].balance_due)).toBe(0);

    // Verify AR Subledger == GL Control Account
    const arIntegrity = await SalesEngine.verifyARIntegrity(ORG_ID);
    expect(arIntegrity.difference).toBe(0);
    expect(arIntegrity.isValid).toBe(true);
  });

  // -------------------------------------------------------------
  // 2. ESTIMATE -> SALES ORDER -> INVOICE GOLDEN TEST (REQ 61)
  // -------------------------------------------------------------
  it('2. Estimate -> Sales Order -> Invoice Workflow with Partial Invoicing', async () => {
    const cust = await SalesEngine.createCustomer(ORG_ID, { displayName: 'Beta Corp' });

    // 1. Create Estimate
    const est = await SalesEngine.createEstimate(ORG_ID, {
      customerId: cust.id,
      customerName: cust.displayName,
      issueDate: '2026-04-01',
      expiryDate: '2026-04-15',
      status: 'SENT',
      lineItems: [{ description: 'Project Phase 1', quantity: 1, unitPrice: 100000, taxRate: 0 }],
    });
    expect(est.totalAmount).toBe(100000);

    // Estimate revision
    const revisedEst = await SalesEngine.reviseEstimate(
      ORG_ID,
      est.id,
      'Scope Addition',
      { lineItems: [{ description: 'Project Phase 1 Revised', quantity: 1, unitPrice: 100000, taxRate: 0 }] },
      'User-1'
    );
    expect(revisedEst.revisionNumber).toBe(1);

    // Convert Estimate to Sales Order
    const so = await SalesEngine.createSalesOrder(ORG_ID, {
      estimateId: est.id,
      customerId: cust.id,
      customerName: cust.displayName,
      orderDate: '2026-04-05',
      status: 'CONFIRMED',
      lineItems: [{ description: 'Project Phase 1 Revised', quantity: 1, unitPrice: 100000, taxRate: 0 }],
    });
    expect(so.totalAmount).toBe(100000);

    // Verify Estimates and Sales Orders DO NOT post GL entries
    const glCheck = await db.query(`SELECT COUNT(*) as cnt FROM journal_entries WHERE organization_id = $1`, [ORG_ID]);
    expect(Number(glCheck.rows[0].cnt)).toBe(0);

    // Partial Invoice 1: ₹40,000
    const inv1 = await SalesEngine.createAndPostInvoice(ORG_ID, {
      salesOrderId: so.id,
      customerId: cust.id,
      customerName: cust.displayName,
      issueDate: '2026-04-10',
      dueDate: '2026-05-10',
      status: 'POSTED',
      lineItems: [{ description: 'Milestone 1 Payment', quantity: 1, unitPrice: 40000, taxRate: 0 }],
    });
    expect(inv1.totalAmount).toBe(40000);

    const soCheck1 = await db.query(`SELECT status, invoiced_amount FROM sales_orders WHERE id = $1`, [so.id]);
    expect(soCheck1.rows[0].status).toBe('PARTIALLY_INVOICED');
    expect(Number(soCheck1.rows[0].invoiced_amount)).toBe(40000);

    // Partial Invoice 2: ₹60,000 (completes order)
    const inv2 = await SalesEngine.createAndPostInvoice(ORG_ID, {
      salesOrderId: so.id,
      customerId: cust.id,
      customerName: cust.displayName,
      issueDate: '2026-04-20',
      dueDate: '2026-05-20',
      status: 'POSTED',
      lineItems: [{ description: 'Milestone 2 Payment', quantity: 1, unitPrice: 60000, taxRate: 0 }],
    });
    expect(inv2.totalAmount).toBe(60000);

    const soCheck2 = await db.query(`SELECT status, invoiced_amount FROM sales_orders WHERE id = $1`, [so.id]);
    expect(soCheck2.rows[0].status).toBe('INVOICED');
    expect(Number(soCheck2.rows[0].invoiced_amount)).toBe(100000);

    await FinancialDestructiveActionsService.voidInvoice(
      ORG_ID,
      inv2.id,
      'sales-correction-user',
      'Cancel the second milestone invoice before collection'
    );
    const soAfterVoid = await db.query(`SELECT status, invoiced_amount FROM sales_orders WHERE id = $1`, [so.id]);
    expect(soAfterVoid.rows[0].status).toBe('PARTIALLY_INVOICED');
    expect(Number(soAfterVoid.rows[0].invoiced_amount)).toBe(40000);
  });

  // -------------------------------------------------------------
  // 3. ADVANCE GOLDEN TEST (REQUIREMENT 62)
  // -------------------------------------------------------------
  it('3. Customer Advance Golden Test: Advance -> Invoice -> Apply Advance', async () => {
    const cust = await SalesEngine.createCustomer(ORG_ID, { displayName: 'Gamma Logistics' });

    // 1. Record Advance Payment of ₹50,000 before invoice
    const pmt = await SalesEngine.recordPayment(ORG_ID, {
      customerId: cust.id,
      customerName: cust.displayName,
      paymentDate: '2026-04-01',
      amount: 50000,
      paymentMode: 'Bank Transfer',
      depositToAccountId: 'acc-bank-1',
      allocations: [], // Unallocated = ₹50,000 Advance
    });
    expect(pmt.unallocatedAmount).toBe(50000);

    // Verify Advance balance recorded
    const advRes = await db.query(`SELECT * FROM customer_advances WHERE organization_id = $1 AND customer_id = $2`, [ORG_ID, cust.id]);
    expect(advRes.rows.length).toBe(1);
    expect(Number(advRes.rows[0].unapplied_amount)).toBe(50000);

    // 2. Issue Invoice for ₹118,000
    const inv = await SalesEngine.createAndPostInvoice(ORG_ID, {
      customerId: cust.id,
      customerName: cust.displayName,
      issueDate: '2026-04-10',
      dueDate: '2026-05-10',
      status: 'POSTED',
      lineItems: [{ description: 'Freight Services', quantity: 1, unitPrice: 100000, taxRate: 18 }],
    });
    expect(inv.totalAmount).toBe(118000);

    // 3. Apply Advance of ₹50,000 to Invoice
    const appRes = await SalesEngine.applyAdvanceToInvoice(ORG_ID, advRes.rows[0].id, inv.id, 50000, '2026-04-12');
    expect(appRes.appliedAmount).toBe(50000);
    expect(appRes.invoiceRemainingBalance).toBe(68000);

    // Verify Advance unapplied balance is 0
    const advCheck = await db.query(`SELECT unapplied_amount, status FROM customer_advances WHERE id = $1`, [advRes.rows[0].id]);
    expect(Number(advCheck.rows[0].unapplied_amount)).toBe(0);
    expect(advCheck.rows[0].status).toBe('APPLIED');

    // Verify AR Integrity
    const arIntegrity = await SalesEngine.verifyARIntegrity(ORG_ID);
    expect(arIntegrity.difference).toBe(0);
  });

  // -------------------------------------------------------------
  // 4. PERIOD LOCK ENFORCEMENT TEST
  // -------------------------------------------------------------
  it('4. Period Lock prevents creating/mutating financial sales documents in locked period', async () => {
    // Set Period Lock up to 2026-03-31
    await db.query(`
      INSERT INTO period_locks (id, organization_id, lock_date, locked_by, status)
      VALUES ('lock-p4', '${ORG_ID}', '2026-03-31', 'Controller', 'Active')
    `);

    const cust = await SalesEngine.createCustomer(ORG_ID, { displayName: 'Delta Corp' });

    // Attempting to post invoice in locked period (2026-03-15) MUST fail
    await expect(
      SalesEngine.createAndPostInvoice(ORG_ID, {
        customerId: cust.id,
        customerName: cust.displayName,
        issueDate: '2026-03-15',
        dueDate: '2026-04-15',
        status: 'POSTED',
        lineItems: [{ description: 'Test', quantity: 1, unitPrice: 1000, taxRate: 0 }],
      })
    ).rejects.toThrow(/locked accounting period/);

    // Posting in unlocked period (2026-04-05) succeeds
    const inv = await SalesEngine.createAndPostInvoice(ORG_ID, {
      customerId: cust.id,
      customerName: cust.displayName,
      issueDate: '2026-04-05',
      dueDate: '2026-05-05',
      status: 'POSTED',
      lineItems: [{ description: 'Test', quantity: 1, unitPrice: 1000, taxRate: 0 }],
    });
    expect(inv.id).toBeDefined();
  });

  // -------------------------------------------------------------
  // 5. TENANT ISOLATION TEST
  // -------------------------------------------------------------
  it('5. Tenant isolation ensures Org A sales data cannot leak into Org B', async () => {
    const custA = await SalesEngine.createCustomer(ORG_ID, { displayName: 'Tenant A Customer' });
    const custB = await SalesEngine.createCustomer(ORG_B, { displayName: 'Tenant B Customer' });

    await SalesEngine.createAndPostInvoice(ORG_ID, {
      customerId: custA.id,
      customerName: custA.displayName,
      issueDate: '2026-04-01',
      dueDate: '2026-05-01',
      status: 'POSTED',
      lineItems: [{ description: 'Org A Item', quantity: 1, unitPrice: 5000, taxRate: 0 }],
    });

    const resB = await db.query(`SELECT * FROM invoices WHERE organization_id = $1`, [ORG_B]);
    expect(resB.rows.length).toBe(0);
  });
});
