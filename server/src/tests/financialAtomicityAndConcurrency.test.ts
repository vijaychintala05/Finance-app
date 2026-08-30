import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { newId } from '../utils/ids';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';

describe('Financial Operations Atomicity, Concurrency Protection & Failure Injection Tests', () => {
  const orgId = 'org-atomicity-test';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    // Create test organization
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, 'India', 'INR', '₹', 'user-owner')
       ON CONFLICT (id) DO NOTHING`,
      [orgId, `uuid-${orgId}`, `pub-${orgId}`, 'ATOM', 'Atomicity Test Org']
    );

    // Seed required accounts
    await db.query(`
      INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance)
      VALUES 
        ('acc-1010', '${orgId}', '1010', 'Bank Account', 'Asset', 'Bank', 100000.00),
        ('acc-1100', '${orgId}', '1100', 'Accounts Receivable', 'Asset', 'Accounts Receivable', 0.00),
        ('acc-1200', '${orgId}', '1200', 'Vendor Advances Asset', 'Asset', 'Other Current Asset', 0.00),
        ('acc-2000', '${orgId}', '2000', 'Accounts Payable', 'Liability', 'Accounts Payable', 0.00),
        ('acc-2100', '${orgId}', '2100', 'Customer Advances', 'Liability', 'Other Current Liability', 0.00),
        ('acc-2200', '${orgId}', '2200', 'Sales Tax Payable', 'Liability', 'Tax Payable', 0.00),
        ('acc-4000', '${orgId}', '4000', 'Sales Revenue', 'Income', 'Sales', 0.00),
        ('acc-5000', '${orgId}', '5000', 'Operating Expense', 'Expense', 'Operating Expense', 0.00),
        ('acc-5100', '${orgId}', '5100', 'Purchase Discount', 'Income', 'Other Income', 0.00),
        ('acc-6000', '${orgId}', '6000', 'Bad Debt Expense', 'Expense', 'Operating Expense', 0.00)
      ON CONFLICT DO NOTHING;
    `);

    // Create customer
    await db.query(
      `INSERT INTO customers (id, organization_id, display_name, email, currency)
       VALUES ($1, $2, 'Test Customer', 'customer@example.com', 'INR')
       ON CONFLICT (id) DO NOTHING`,
      ['cust-atom-1', orgId]
    );

    // Create client
    await db.query(
      `INSERT INTO clients (id, organization_id, name, email, currency)
       VALUES ($1, $2, 'Test Customer', 'customer@example.com', 'INR')
       ON CONFLICT (id) DO NOTHING`,
      ['cust-atom-1', orgId]
    );

    // Create vendor
    await db.query(
      `INSERT INTO vendors (id, organization_id, name, email, currency)
       VALUES ($1, $2, 'Test Vendor', 'vendor@example.com', 'INR')
       ON CONFLICT (id) DO NOTHING`,
      ['vend-atom-1', orgId]
    );
  });

  // -------------------------------------------------------------
  // 1. SALES ENGINE FAILURE INJECTIONS
  // -------------------------------------------------------------
  it('1. Customer payment rolls back completely on forced failure AFTER journal creation', async () => {
    const invoice = await SalesEngine.createAndPostInvoice(orgId, {
      customerId: 'cust-atom-1',
      customerName: 'Test Customer',
      issueDate: '2026-08-12',
      dueDate: '2026-08-12',
      lineItems: [{ description: 'Consulting', quantity: 1, unitPrice: 500, taxRate: 0, amount: 500 }],
    });

    const initialJournals = (await db.query(`SELECT id FROM journal_entries WHERE organization_id = $1`, [orgId])).rows;

    await expect(
      SalesEngine.recordPayment(orgId, {
        customerId: 'cust-atom-1',
        customerName: 'Test Customer',
        paymentDate: '2026-08-12',
        amount: 250,
        paymentMode: 'Bank Transfer',
        depositToAccountId: '1010',
        allocations: [{ invoiceId: invoice.id, amount: 250 }],
        _debugFailPoint: 'after_journal',
      })
    ).rejects.toThrow(/Forced failure after journal entry creation/i);

    const payments = (await db.query(`SELECT id FROM payments_received WHERE organization_id = $1`, [orgId])).rows;
    expect(payments.length).toBe(0);

    const allocations = (await db.query(`SELECT id FROM payment_received_allocations WHERE organization_id = $1`, [orgId])).rows;
    expect(allocations.length).toBe(0);

    const currentJournals = (await db.query(`SELECT id FROM journal_entries WHERE organization_id = $1`, [orgId])).rows;
    expect(currentJournals.length).toBe(initialJournals.length);

    const inv = (await db.query(`SELECT paid_amount, balance_due, status FROM invoices WHERE organization_id = $1 AND id = $2`, [orgId, invoice.id])).rows[0];
    expect(Number(inv.paid_amount)).toBe(0);
    expect(Number(inv.balance_due)).toBe(500);
    expect(inv.status).toBe('POSTED');
  });

  it('2. Customer payment rolls back completely on forced failure AFTER payment record write', async () => {
    const invoice = await SalesEngine.createAndPostInvoice(orgId, {
      customerId: 'cust-atom-1',
      customerName: 'Test Customer',
      issueDate: '2026-08-12',
      dueDate: '2026-08-12',
      lineItems: [{ description: 'Consulting', quantity: 1, unitPrice: 500, taxRate: 0, amount: 500 }],
    });

    await expect(
      SalesEngine.recordPayment(orgId, {
        customerId: 'cust-atom-1',
        customerName: 'Test Customer',
        paymentDate: '2026-08-12',
        amount: 250,
        paymentMode: 'Bank Transfer',
        depositToAccountId: '1010',
        allocations: [{ invoiceId: invoice.id, amount: 250 }],
        _debugFailPoint: 'after_payment',
      })
    ).rejects.toThrow(/Forced failure after payment write/i);

    const payments = (await db.query(`SELECT id FROM payments_received WHERE organization_id = $1`, [orgId])).rows;
    expect(payments.length).toBe(0);
  });

  it('3. Customer payment rolls back completely on forced failure AFTER first allocation in multi-invoice batch', async () => {
    const inv1 = await SalesEngine.createAndPostInvoice(orgId, {
      customerId: 'cust-atom-1',
      customerName: 'Test Customer',
      issueDate: '2026-08-12',
      dueDate: '2026-08-12',
      lineItems: [{ description: 'Item 1', quantity: 1, unitPrice: 300, taxRate: 0, amount: 300 }],
    });
    const inv2 = await SalesEngine.createAndPostInvoice(orgId, {
      customerId: 'cust-atom-1',
      customerName: 'Test Customer',
      issueDate: '2026-08-12',
      dueDate: '2026-08-12',
      lineItems: [{ description: 'Item 2', quantity: 1, unitPrice: 300, taxRate: 0, amount: 300 }],
    });

    await expect(
      SalesEngine.recordPayment(orgId, {
        customerId: 'cust-atom-1',
        customerName: 'Test Customer',
        paymentDate: '2026-08-12',
        amount: 600,
        paymentMode: 'Bank Transfer',
        depositToAccountId: '1010',
        allocations: [
          { invoiceId: inv1.id, amount: 300 },
          { invoiceId: inv2.id, amount: 300 },
        ],
        _debugFailPoint: 'after_first_allocation',
      })
    ).rejects.toThrow(/Forced failure after first allocation write/i);

    const inv1Check = (await db.query(`SELECT paid_amount, balance_due, status FROM invoices WHERE organization_id = $1 AND id = $2`, [orgId, inv1.id])).rows[0];
    expect(Number(inv1Check.paid_amount)).toBe(0);
    expect(Number(inv1Check.balance_due)).toBe(300);
    expect(inv1Check.status).toBe('POSTED');

    const inv2Check = (await db.query(`SELECT paid_amount, balance_due, status FROM invoices WHERE organization_id = $1 AND id = $2`, [orgId, inv2.id])).rows[0];
    expect(Number(inv2Check.paid_amount)).toBe(0);
    expect(Number(inv2Check.balance_due)).toBe(300);
    expect(inv2Check.status).toBe('POSTED');
  });

  // -------------------------------------------------------------
  // 2. PURCHASES BILL CREATION & PAYMENT FAILURE INJECTIONS
  // -------------------------------------------------------------
  it('4. Vendor bill rolls back completely on forced failure AFTER journal creation', async () => {
    const initialJournals = (await db.query(`SELECT id FROM journal_entries WHERE organization_id = $1`, [orgId])).rows;

    await expect(
      PurchasesEngine.createAndPostBill(
        orgId,
        {
          vendorId: 'vend-atom-1',
          vendorName: 'Test Vendor',
          billDate: '2026-08-12',
          dueDate: '2026-08-12',
          lineItems: [{ description: 'Supplies', quantity: 1, unitPrice: 300, taxRate: 0, amount: 300 }],
        },
        undefined,
        'after_journal'
      )
    ).rejects.toThrow(/SIMULATED_FAILURE_AFTER_JOURNAL/i);

    const bills = (await db.query(`SELECT id FROM bills WHERE organization_id = $1`, [orgId])).rows;
    expect(bills.length).toBe(0);

    const currentJournals = (await db.query(`SELECT id FROM journal_entries WHERE organization_id = $1`, [orgId])).rows;
    expect(currentJournals.length).toBe(initialJournals.length);

    const vendor = (await db.query(`SELECT payables_balance FROM vendors WHERE organization_id = $1 AND id = 'vend-atom-1'`, [orgId])).rows[0];
    expect(Number(vendor.payables_balance)).toBe(0);
  });

  it('5. Vendor bill rolls back completely on forced failure AFTER bill insert', async () => {
    await expect(
      PurchasesEngine.createAndPostBill(
        orgId,
        {
          vendorId: 'vend-atom-1',
          vendorName: 'Test Vendor',
          billDate: '2026-08-12',
          dueDate: '2026-08-12',
          lineItems: [{ description: 'Supplies', quantity: 1, unitPrice: 300, taxRate: 0, amount: 300 }],
        },
        undefined,
        'after_bill'
      )
    ).rejects.toThrow(/SIMULATED_FAILURE_AFTER_BILL/i);

    const bills = (await db.query(`SELECT id FROM bills WHERE organization_id = $1`, [orgId])).rows;
    expect(bills.length).toBe(0);

    const vendor = (await db.query(`SELECT payables_balance FROM vendors WHERE organization_id = $1 AND id = 'vend-atom-1'`, [orgId])).rows[0];
    expect(Number(vendor.payables_balance)).toBe(0);
  });

  it('6. Vendor bill rolls back completely on forced failure AFTER PO update', async () => {
    const po = await PurchasesEngine.createPurchaseOrder(orgId, {
      vendorId: 'vend-atom-1',
      vendorName: 'Test Vendor',
      orderDate: '2026-08-12',
      lineItems: [{ description: 'Supplies', quantity: 1, unitPrice: 300, taxRate: 0, amount: 300 }],
    });

    await expect(
      PurchasesEngine.createAndPostBill(
        orgId,
        {
          purchaseOrderId: po.id,
          vendorId: 'vend-atom-1',
          vendorName: 'Test Vendor',
          billDate: '2026-08-12',
          dueDate: '2026-08-12',
          lineItems: [{ description: 'Supplies', quantity: 1, unitPrice: 300, taxRate: 0, amount: 300 }],
        },
        undefined,
        'after_po'
      )
    ).rejects.toThrow(/SIMULATED_FAILURE_AFTER_PO/i);

    const bills = (await db.query(`SELECT id FROM bills WHERE organization_id = $1`, [orgId])).rows;
    expect(bills.length).toBe(0);

    const poCheck = (await db.query(`SELECT billed_amount, status FROM purchase_orders WHERE organization_id = $1 AND id = $2`, [orgId, po.id])).rows[0];
    expect(Number(poCheck.billed_amount)).toBe(0);
    expect(poCheck.status).toBe('DRAFT');
  });

  it('7. Vendor bill rolls back completely on forced failure AFTER vendor payables update', async () => {
    await expect(
      PurchasesEngine.createAndPostBill(
        orgId,
        {
          vendorId: 'vend-atom-1',
          vendorName: 'Test Vendor',
          billDate: '2026-08-12',
          dueDate: '2026-08-12',
          lineItems: [{ description: 'Supplies', quantity: 1, unitPrice: 300, taxRate: 0, amount: 300 }],
        },
        undefined,
        'after_vendor'
      )
    ).rejects.toThrow(/SIMULATED_FAILURE_AFTER_VENDOR/i);

    const bills = (await db.query(`SELECT id FROM bills WHERE organization_id = $1`, [orgId])).rows;
    expect(bills.length).toBe(0);

    const vendor = (await db.query(`SELECT payables_balance FROM vendors WHERE organization_id = $1 AND id = 'vend-atom-1'`, [orgId])).rows[0];
    expect(Number(vendor.payables_balance)).toBe(0);
  });

  it('8. Vendor payment rolls back completely on forced failure AFTER journal creation', async () => {
    const bill = await PurchasesEngine.createAndPostBill(orgId, {
      vendorId: 'vend-atom-1',
      vendorName: 'Test Vendor',
      billDate: '2026-08-12',
      dueDate: '2026-08-12',
      lineItems: [{ description: 'Supplies', quantity: 1, unitPrice: 300, taxRate: 0, amount: 300 }],
    });

    await expect(
      PurchasesEngine.recordVendorPayment(orgId, {
        vendorId: 'vend-atom-1',
        vendorName: 'Test Vendor',
        paymentDate: '2026-08-12',
        amount: 300,
        paidFromAccountId: '1010',
        allocations: [{ billId: bill.id, amount: 300 }],
        _debugFailPoint: 'after_journal',
      })
    ).rejects.toThrow(/Forced failure after journal creation/i);

    const pmts = (await db.query(`SELECT id FROM payments_made WHERE organization_id = $1`, [orgId])).rows;
    expect(pmts.length).toBe(0);

    const b = (await db.query(`SELECT amount_paid, balance_due, status FROM bills WHERE organization_id = $1 AND id = $2`, [orgId, bill.id])).rows[0];
    expect(Number(b.amount_paid)).toBe(0);
    expect(Number(b.balance_due)).toBe(300);
    expect(b.status).toBe('POSTED');
  });

  it('9. Vendor payment rolls back completely on forced failure AFTER payment write', async () => {
    const bill = await PurchasesEngine.createAndPostBill(orgId, {
      vendorId: 'vend-atom-1',
      vendorName: 'Test Vendor',
      billDate: '2026-08-12',
      dueDate: '2026-08-12',
      lineItems: [{ description: 'Supplies', quantity: 1, unitPrice: 300, taxRate: 0, amount: 300 }],
    });

    await expect(
      PurchasesEngine.recordVendorPayment(orgId, {
        vendorId: 'vend-atom-1',
        vendorName: 'Test Vendor',
        paymentDate: '2026-08-12',
        amount: 300,
        paidFromAccountId: '1010',
        allocations: [{ billId: bill.id, amount: 300 }],
        _debugFailPoint: 'after_payment',
      })
    ).rejects.toThrow(/Forced failure after payment write/i);

    const pmts = (await db.query(`SELECT id FROM payments_made WHERE organization_id = $1`, [orgId])).rows;
    expect(pmts.length).toBe(0);
  });

  it('10. Vendor payment rolls back completely on forced failure AFTER first allocation in multi-bill batch', async () => {
    const b1 = await PurchasesEngine.createAndPostBill(orgId, {
      vendorId: 'vend-atom-1',
      vendorName: 'Test Vendor',
      billDate: '2026-08-12',
      dueDate: '2026-08-12',
      lineItems: [{ description: 'Item 1', quantity: 1, unitPrice: 200, taxRate: 0, amount: 200 }],
    });
    const b2 = await PurchasesEngine.createAndPostBill(orgId, {
      vendorId: 'vend-atom-1',
      vendorName: 'Test Vendor',
      billDate: '2026-08-12',
      dueDate: '2026-08-12',
      lineItems: [{ description: 'Item 2', quantity: 1, unitPrice: 200, taxRate: 0, amount: 200 }],
    });

    await expect(
      PurchasesEngine.recordVendorPayment(orgId, {
        vendorId: 'vend-atom-1',
        vendorName: 'Test Vendor',
        paymentDate: '2026-08-12',
        amount: 400,
        paidFromAccountId: '1010',
        allocations: [
          { billId: b1.id, amount: 200 },
          { billId: b2.id, amount: 200 },
        ],
        _debugFailPoint: 'after_first_allocation',
      })
    ).rejects.toThrow(/Forced failure after first allocation write/i);

    const b1Check = (await db.query(`SELECT amount_paid, balance_due, status FROM bills WHERE organization_id = $1 AND id = $2`, [orgId, b1.id])).rows[0];
    expect(Number(b1Check.amount_paid)).toBe(0);
    expect(Number(b1Check.balance_due)).toBe(200);
    expect(b1Check.status).toBe('POSTED');

    const b2Check = (await db.query(`SELECT amount_paid, balance_due, status FROM bills WHERE organization_id = $1 AND id = $2`, [orgId, b2.id])).rows[0];
    expect(Number(b2Check.amount_paid)).toBe(0);
    expect(Number(b2Check.balance_due)).toBe(200);
    expect(b2Check.status).toBe('POSTED');
  });

  // -------------------------------------------------------------
  // 3. ALLOCATION AGGREGATION & DEADLOCK-FREE SORTING
  // -------------------------------------------------------------
  it('11. Aggregates multiple allocation line items targeting the same invoice without duplicate locks or race conditions', async () => {
    const invoice = await SalesEngine.createAndPostInvoice(orgId, {
      customerId: 'cust-atom-1',
      customerName: 'Test Customer',
      issueDate: '2026-08-12',
      dueDate: '2026-08-12',
      lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100, taxRate: 0, amount: 100 }],
    });

    const pmt = await SalesEngine.recordPayment(orgId, {
      customerId: 'cust-atom-1',
      customerName: 'Test Customer',
      paymentDate: '2026-08-12',
      amount: 70,
      paymentMode: 'Bank Transfer',
      depositToAccountId: '1010',
      allocations: [
        { invoiceId: invoice.id, amount: 40 },
        { invoiceId: invoice.id, amount: 30 },
      ],
    });
    expect(pmt.paymentId).toBeDefined();

    const inv = (await db.query(`SELECT paid_amount, balance_due, status FROM invoices WHERE organization_id = $1 AND id = $2`, [orgId, invoice.id])).rows[0];
    expect(Number(inv.paid_amount)).toBe(70);
    expect(Number(inv.balance_due)).toBe(30);
    expect(inv.status).toBe('PARTIALLY_PAID');
  });

  // -------------------------------------------------------------
  // 4. GENUINE CONCURRENT TRANSACTIONS (PROMISE.ALLSETTLED)
  // -------------------------------------------------------------
  it('12. Simultaneous concurrent payment transactions against the same invoice enforce invariant without over-allocation', async () => {
    const invoice = await SalesEngine.createAndPostInvoice(orgId, {
      customerId: 'cust-atom-1',
      customerName: 'Test Customer',
      issueDate: '2026-08-12',
      dueDate: '2026-08-12',
      lineItems: [{ description: 'Consulting', quantity: 1, unitPrice: 100, taxRate: 0, amount: 100 }],
    });

    // Launch two concurrent transactions simultaneously with Promise.allSettled
    const [res1, res2] = await Promise.allSettled([
      SalesEngine.recordPayment(orgId, {
        customerId: 'cust-atom-1',
        customerName: 'Test Customer',
        paymentDate: '2026-08-12',
        amount: 80,
        paymentMode: 'Bank Transfer',
        depositToAccountId: '1010',
        allocations: [{ invoiceId: invoice.id, amount: 80 }],
      }),
      SalesEngine.recordPayment(orgId, {
        customerId: 'cust-atom-1',
        customerName: 'Test Customer',
        paymentDate: '2026-08-12',
        amount: 80,
        paymentMode: 'Bank Transfer',
        depositToAccountId: '1010',
        allocations: [{ invoiceId: invoice.id, amount: 80 }],
      }),
    ]);

    // Exactly one transaction must succeed and one must be rejected
    const succeeded = [res1, res2].filter((r) => r.status === 'fulfilled');
    const failed = [res1, res2].filter((r) => r.status === 'rejected');

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);

    const inv = (await db.query(`SELECT paid_amount, balance_due, status FROM invoices WHERE organization_id = $1 AND id = $2`, [orgId, invoice.id])).rows[0];
    expect(Number(inv.paid_amount)).toBe(80);
    expect(Number(inv.balance_due)).toBe(20);
    expect(inv.status).toBe('PARTIALLY_PAID');
  });

  it('13. Multi-invoice concurrent allocations with reversed ordering execute deadlock-free via sorted lock acquisition', async () => {
    const invA = await SalesEngine.createAndPostInvoice(orgId, {
      customerId: 'cust-atom-1',
      customerName: 'Test Customer',
      issueDate: '2026-08-12',
      dueDate: '2026-08-12',
      lineItems: [{ description: 'Item A', quantity: 1, unitPrice: 100, taxRate: 0, amount: 100 }],
    });

    const invB = await SalesEngine.createAndPostInvoice(orgId, {
      customerId: 'cust-atom-1',
      customerName: 'Test Customer',
      issueDate: '2026-08-12',
      dueDate: '2026-08-12',
      lineItems: [{ description: 'Item B', quantity: 1, unitPrice: 100, taxRate: 0, amount: 100 }],
    });

    // Transaction 1 targets [invA, invB] while Transaction 2 targets [invB, invA]
    const [res1, res2] = await Promise.allSettled([
      SalesEngine.recordPayment(orgId, {
        customerId: 'cust-atom-1',
        customerName: 'Test Customer',
        paymentDate: '2026-08-12',
        amount: 40,
        paymentMode: 'Bank Transfer',
        depositToAccountId: '1010',
        allocations: [
          { invoiceId: invA.id, amount: 20 },
          { invoiceId: invB.id, amount: 20 },
        ],
      }),
      SalesEngine.recordPayment(orgId, {
        customerId: 'cust-atom-1',
        customerName: 'Test Customer',
        paymentDate: '2026-08-12',
        amount: 40,
        paymentMode: 'Bank Transfer',
        depositToAccountId: '1010',
        allocations: [
          { invoiceId: invB.id, amount: 20 },
          { invoiceId: invA.id, amount: 20 },
        ],
      }),
    ]);

    expect(res1.status).toBe('fulfilled');
    expect(res2.status).toBe('fulfilled');

    const invACheck = (await db.query(`SELECT paid_amount, balance_due FROM invoices WHERE organization_id = $1 AND id = $2`, [orgId, invA.id])).rows[0];
    const invBCheck = (await db.query(`SELECT paid_amount, balance_due FROM invoices WHERE organization_id = $1 AND id = $2`, [orgId, invB.id])).rows[0];

    expect(Number(invACheck.paid_amount)).toBe(40);
    expect(Number(invACheck.balance_due)).toBe(60);
    expect(Number(invBCheck.paid_amount)).toBe(40);
    expect(Number(invBCheck.balance_due)).toBe(60);
  });

  // -------------------------------------------------------------
  // 5. CUSTOMER ADVANCE ISOLATION & DRAWDOWN
  // -------------------------------------------------------------
  it('14. Customer advance application requires customer ownership and enforces balance drawdown', async () => {
    await db.query(
      `INSERT INTO customers (id, organization_id, display_name, email, currency)
       VALUES ('cust-atom-2', $1, 'Other Customer', 'other@example.com', 'INR')
       ON CONFLICT (id) DO NOTHING`,
      [orgId]
    );

    const pmt = await SalesEngine.recordPayment(orgId, {
      customerId: 'cust-atom-1',
      customerName: 'Test Customer',
      paymentDate: '2026-08-12',
      amount: 100,
      paymentMode: 'Bank Transfer',
      depositToAccountId: '1010',
      allocations: [],
    });
    expect(pmt.unallocatedAmount).toBe(100);

    const advRes = await db.query(`SELECT id FROM customer_advances WHERE organization_id = $1 AND customer_id = 'cust-atom-1'`, [orgId]);
    const advanceId = advRes.rows[0].id;

    const invoiceCust2 = await SalesEngine.createAndPostInvoice(orgId, {
      customerId: 'cust-atom-2',
      customerName: 'Other Customer',
      issueDate: '2026-08-12',
      dueDate: '2026-08-12',
      lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100, taxRate: 0, amount: 100 }],
    });

    // Cross-customer advance application must fail
    await expect(
      SalesEngine.applyAdvanceToInvoice(orgId, advanceId, invoiceCust2.id, 50, '2026-08-12')
    ).rejects.toThrow(/CROSS_CUSTOMER_ALLOCATION/i);

    const invoiceCust1 = await SalesEngine.createAndPostInvoice(orgId, {
      customerId: 'cust-atom-1',
      customerName: 'Test Customer',
      issueDate: '2026-08-12',
      dueDate: '2026-08-12',
      lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100, taxRate: 0, amount: 100 }],
    });

    const applyRes = await SalesEngine.applyAdvanceToInvoice(orgId, advanceId, invoiceCust1.id, 60, '2026-08-12');
    expect(applyRes.appliedAmount).toBe(60);
    expect(applyRes.invoiceRemainingBalance).toBe(40);

    // Remaining advance is 40. Applying 50 must fail
    await expect(
      SalesEngine.applyAdvanceToInvoice(orgId, advanceId, invoiceCust1.id, 50, '2026-08-12')
    ).rejects.toThrow(/exceeds available advance balance/i);
  });

  it('15. Vendor payment reversal restores bill and vendor balances and reverses its advance atomically', async () => {
    const bill = await PurchasesEngine.createAndPostBill(orgId, {
      vendorId: 'vend-atom-1',
      vendorName: 'Test Vendor',
      billDate: '2026-08-12',
      dueDate: '2026-08-12',
      lineItems: [{ description: 'Supplies', quantity: 1, unitPrice: 300, taxRate: 0, amount: 300 }],
    });
    const payment = await PurchasesEngine.recordVendorPayment(orgId, {
      vendorId: 'vend-atom-1',
      vendorName: 'Test Vendor',
      paymentDate: '2026-08-12',
      amount: 400,
      paidFromAccountId: '1010',
      allocations: [{ billId: bill.id, amount: 300 }],
    });

    const settledVendor = (await db.query(
      `SELECT payables_balance, advance_balance FROM vendors WHERE organization_id = $1 AND id = 'vend-atom-1'`,
      [orgId]
    )).rows[0];
    expect(Number(settledVendor.payables_balance)).toBe(0);
    expect(Number(settledVendor.advance_balance)).toBe(100);

    await FinancialDestructiveActionsService.reverseVendorPayment(
      orgId, payment.id, 'user-owner', 'Payment entered against the wrong bank account'
    );

    const restoredBill = (await db.query(
      'SELECT amount_paid, balance_due, status FROM bills WHERE organization_id = $1 AND id = $2',
      [orgId, bill.id]
    )).rows[0];
    expect(Number(restoredBill.amount_paid)).toBe(0);
    expect(Number(restoredBill.balance_due)).toBe(300);
    expect(restoredBill.status).toBe('POSTED');

    const restoredVendor = (await db.query(
      `SELECT payables_balance, advance_balance FROM vendors WHERE organization_id = $1 AND id = 'vend-atom-1'`,
      [orgId]
    )).rows[0];
    expect(Number(restoredVendor.payables_balance)).toBe(300);
    expect(Number(restoredVendor.advance_balance)).toBe(0);
    expect((await db.query(
      `SELECT id FROM vendor_advances WHERE organization_id = $1 AND payment_id = $2 AND status = 'REVERSED'`,
      [orgId, payment.id]
    )).rows).toHaveLength(1);
  });

  it('16. Customer advance application reversal restores both the advance and invoice', async () => {
    const payment = await SalesEngine.recordPayment(orgId, {
      customerId: 'cust-atom-1', customerName: 'Test Customer', paymentDate: '2026-08-12',
      amount: 100, paymentMode: 'Bank Transfer', depositToAccountId: '1010', allocations: [],
    });
    const advance = (await db.query(
      'SELECT id FROM customer_advances WHERE organization_id = $1 AND payment_id = $2',
      [orgId, payment.id]
    )).rows[0];
    const invoice = await SalesEngine.createAndPostInvoice(orgId, {
      customerId: 'cust-atom-1', customerName: 'Test Customer', issueDate: '2026-08-12', dueDate: '2026-08-12',
      lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100, taxRate: 0, amount: 100 }],
    });
    await SalesEngine.applyAdvanceToInvoice(orgId, advance.id, invoice.id, 60, '2026-08-12');
    const application = (await db.query(
      'SELECT id FROM customer_advance_applications WHERE organization_id = $1 AND advance_id = $2',
      [orgId, advance.id]
    )).rows[0];

    await FinancialDestructiveActionsService.reverseAdvanceApplication(
      'customer', orgId, application.id, 'user-owner', 'Advance was allocated to the wrong invoice'
    );

    const restoredInvoice = (await db.query(
      'SELECT paid_amount, balance_due, status FROM invoices WHERE organization_id = $1 AND id = $2',
      [orgId, invoice.id]
    )).rows[0];
    const restoredAdvance = (await db.query(
      'SELECT unapplied_amount, status FROM customer_advances WHERE organization_id = $1 AND id = $2',
      [orgId, advance.id]
    )).rows[0];
    expect(Number(restoredInvoice.paid_amount)).toBe(0);
    expect(Number(restoredInvoice.balance_due)).toBe(100);
    expect(restoredInvoice.status).toBe('POSTED');
    expect(Number(restoredAdvance.unapplied_amount)).toBe(100);
    expect(restoredAdvance.status).toBe('UNAPPLIED');
  });

  it('17. Credit-note reversal restores every invoice application and preserves history', async () => {
    const invoice = await SalesEngine.createAndPostInvoice(orgId, {
      customerId: 'cust-atom-1', customerName: 'Test Customer', issueDate: '2026-08-12', dueDate: '2026-08-12',
      lineItems: [{ description: 'Service', quantity: 1, unitPrice: 200, taxRate: 0, amount: 200 }],
    });
    const note = await SalesEngine.createCreditNote(orgId, {
      customerId: 'cust-atom-1', customerName: 'Test Customer', invoiceId: invoice.id,
      date: '2026-08-12', taxableAmount: 75, taxAmount: 0, reason: 'Service adjustment',
    });

    await FinancialDestructiveActionsService.reverseCreditNote(
      orgId, note.creditNoteId, 'user-owner', 'Credit note was issued in error'
    );

    const restoredInvoice = (await db.query(
      'SELECT amount_credited, balance_due, status FROM invoices WHERE organization_id = $1 AND id = $2',
      [orgId, invoice.id]
    )).rows[0];
    const reversedNote = (await db.query(
      'SELECT status, remaining_credit, reversal_journal_id FROM credit_notes WHERE organization_id = $1 AND id = $2',
      [orgId, note.creditNoteId]
    )).rows[0];
    const application = (await db.query(
      'SELECT status FROM credit_note_applications WHERE organization_id = $1 AND credit_note_id = $2',
      [orgId, note.creditNoteId]
    )).rows[0];
    expect(Number(restoredInvoice.amount_credited)).toBe(0);
    expect(Number(restoredInvoice.balance_due)).toBe(200);
    expect(restoredInvoice.status).toBe('POSTED');
    expect(reversedNote.status).toBe('REVERSED');
    expect(Number(reversedNote.remaining_credit)).toBe(0);
    expect(reversedNote.reversal_journal_id).toBeTruthy();
    expect(application.status).toBe('REVERSED');
  });

  it('18. Period lock prevents recording payments on locked historical dates', async () => {
    // Lock period for 2025
    await db.query(
      `INSERT INTO period_locks (id, organization_id, period_name, lock_date, is_locked, status)
       VALUES ('lock-2025', $1, '2025-12', '2025-12-31', TRUE, 'Active')`,
      [orgId]
    );

    const invoice = await SalesEngine.createAndPostInvoice(orgId, {
      customerId: 'cust-atom-1', customerName: 'Test Customer', issueDate: '2026-08-01', dueDate: '2026-08-30',
      lineItems: [{ description: 'Dev Service', quantity: 1, unitPrice: 500, taxRate: 0, amount: 500 }],
    });

    // Attempt backdated payment in locked period
    await expect(
      SalesEngine.recordPayment(orgId, {
        customerId: 'cust-atom-1', customerName: 'Test Customer', paymentDate: '2025-10-15',
        amount: 500, depositToAccountId: '1010', allocations: [{ invoiceId: invoice.id, amount: 500 }],
      })
    ).rejects.toThrow(/locked accounting period/i);
  });

  it('19. Prevents payment allocation exceeding outstanding invoice balance', async () => {
    const invoice = await SalesEngine.createAndPostInvoice(orgId, {
      customerId: 'cust-atom-1', customerName: 'Test Customer', issueDate: '2026-08-01', dueDate: '2026-08-30',
      lineItems: [{ description: 'Dev Service', quantity: 1, unitPrice: 300, taxRate: 0, amount: 300 }],
    });

    // Attempt over-allocation ($500 allocated to $300 invoice)
    await expect(
      SalesEngine.recordPayment(orgId, {
        customerId: 'cust-atom-1', customerName: 'Test Customer', paymentDate: '2026-08-10',
        amount: 500, depositToAccountId: '1010', allocations: [{ invoiceId: invoice.id, amount: 500 }],
      })
    ).rejects.toThrow(/exceeds/i);
  });
});
