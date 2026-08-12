import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';

describe('Phase 5: Purchases and Accounts Payable Hardened Test Suite', () => {
  const ORG_ID = 'org-purchases-test-123';
  const ORG_B = 'org-purchases-test-456';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    await db.query(`
      INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
      VALUES
        ('${ORG_ID}', 'uuid-purchases-a', 'PUB-PURCHASE-A', 'PURCHASE-A', 'Purchases Test A', 'Test Jurisdiction', 'INR', 'INR', 'test-owner'),
        ('${ORG_B}', 'uuid-purchases-b', 'PUB-PURCHASE-B', 'PURCHASE-B', 'Purchases Test B', 'Test Jurisdiction', 'INR', 'INR', 'test-owner')
      ON CONFLICT DO NOTHING;
    `);

    // Seed GL Control accounts
    await db.query(`
      INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance)
      VALUES 
        ('acc-ap-control', '${ORG_ID}', '2000', 'Accounts Payable', 'Liability', 'Accounts Payable', 0.00),
        ('acc-expense', '${ORG_ID}', '5000', 'Operating Expense', 'Expense', 'Operating Expense', 0.00),
        ('acc-gst-input', '${ORG_ID}', '2110', 'GST Input Tax Credit', 'Asset', 'Other Current Assets', 0.00),
        ('acc-bank-1', '${ORG_ID}', '1010', 'HDFC Bank Account', 'Asset', 'Cash and Cash Equivalents', 0.00),
        ('acc-vendor-advances', '${ORG_ID}', '1200', 'Vendor Advances Asset', 'Asset', 'Other Current Assets', 0.00),
        ('acc-purchase-discount', '${ORG_ID}', '5100', 'Purchase Discount / Recovery', 'Revenue', 'Other Income', 0.00),
        ('acc-ap-control', '${ORG_B}', '2000', 'Accounts Payable', 'Liability', 'Accounts Payable', 0.00)
      ON CONFLICT DO NOTHING;
    `);
  });

  // -------------------------------------------------------------
  // 1. PURCHASES GOLDEN TEST
  // -------------------------------------------------------------
  it('1. Purchases Golden Test: Bill -> Payment 1 -> Debit Note -> Payment 2 -> AP Write-Off', async () => {
    // 1. Create Vendor
    const vendor = await PurchasesEngine.createVendor(ORG_ID, {
      name: 'Global Tech Supplies',
      legalName: 'Global Tech Supplies Pvt Ltd',
      gstin: '27GBLTS1234A1Z5',
      email: 'accounts@globaltech.com',
    });

    // 2. Post Vendor Bill: ₹118,000 (Taxable ₹100,000 + GST Input ₹18,000)
    const bill = await PurchasesEngine.createAndPostBill(ORG_ID, {
      vendorId: vendor.id,
      vendorName: vendor.name,
      vendorInvoiceNumber: 'INV-GT-9901',
      billDate: '2026-04-10',
      dueDate: '2026-05-10',
      status: 'POSTED',
      subtotal: 100000,
      taxTotal: 18000,
      totalAmount: 118000,
      lineItems: [
        { description: 'Server Hardware', quantity: 1, unitPrice: 100000, amount: 100000, accountId: 'acc-expense', accountCode: '5000' },
      ],
    });

    expect(bill.totalAmount).toBe(118000);
    expect(bill.balanceDue).toBe(118000);

    // Verify AP Control GL Balance = Credit 118,000
    const apAcc = await db.query(`SELECT balance FROM accounts WHERE id = 'acc-ap-control' AND organization_id = $1`, [ORG_ID]);
    expect(Number(apAcc.rows[0].balance)).toBe(118000); // Liability control accounts use their normal credit balance as positive.

    // 3. Payment 1: ₹40,000
    await PurchasesEngine.recordVendorPayment(ORG_ID, {
      vendorId: vendor.id,
      vendorName: vendor.name,
      paymentDate: '2026-04-15',
      amount: 40000,
      paymentMode: 'Bank Transfer',
      paidFromAccountId: 'acc-bank-1',
      allocations: [{ billId: bill.id, amount: 40000 }],
    });

    const billCheck1 = await PurchasesEngine.getBill(ORG_ID, bill.id);
    expect(billCheck1?.balanceDue).toBe(78000);
    expect(billCheck1?.status).toBe('PARTIALLY_PAID');

    // 4. Debit Note: ₹11,800 (Taxable ₹10,000 + GST Input Reversal ₹1,800) applied to Bill
    const dn = await PurchasesEngine.createDebitNote(ORG_ID, {
      vendorId: vendor.id,
      vendorName: vendor.name,
      billId: bill.id,
      date: '2026-04-20',
      taxableAmount: 10000,
      taxAmount: 1800,
      reason: 'Defective RAM Return',
    });
    expect(dn.totalAmount).toBe(11800);

    const billCheck2 = await PurchasesEngine.getBill(ORG_ID, bill.id);
    expect(billCheck2?.balanceDue).toBe(66200);

    // 5. Payment 2: ₹60,000
    await PurchasesEngine.recordVendorPayment(ORG_ID, {
      vendorId: vendor.id,
      vendorName: vendor.name,
      paymentDate: '2026-04-25',
      amount: 60000,
      paymentMode: 'Bank Transfer',
      paidFromAccountId: 'acc-bank-1',
      allocations: [{ billId: bill.id, amount: 60000 }],
    });

    const billCheck3 = await PurchasesEngine.getBill(ORG_ID, bill.id);
    expect(billCheck3?.balanceDue).toBe(6200);

    // 6. AP Write-Off: ₹6,200
    await PurchasesEngine.recordAPWriteOff(ORG_ID, {
      billId: bill.id,
      vendorId: vendor.id,
      writeOffDate: '2026-04-30',
      amount: 6200,
      writeOffAccountId: 'acc-purchase-discount',
      reason: 'Early Settlement Discount',
    });

    const finalBill = await PurchasesEngine.getBill(ORG_ID, bill.id);
    expect(finalBill?.balanceDue).toBe(0);
    expect(finalBill?.status).toBe('WRITTEN_OFF');

    // Verify Final Vendor Payables Balance = 0
    const finalVendor = await PurchasesEngine.getVendor(ORG_ID, vendor.id);
    expect(finalVendor?.payablesBalance).toBe(0);
  });

  // -------------------------------------------------------------
  // 2. PURCHASE ORDER -> GOODS RECEIPT -> PARTIAL PO BILLING
  // -------------------------------------------------------------
  it('2. Purchase Order -> Goods Receipt -> Partial PO Billing', async () => {
    const vendor = await PurchasesEngine.createVendor(ORG_ID, { name: 'Apex Industrial Parts' });

    // 1. Create Purchase Order for ₹200,000
    const po = await PurchasesEngine.createPurchaseOrder(ORG_ID, {
      vendorId: vendor.id,
      vendorName: vendor.name,
      subtotal: 200000,
      totalAmount: 200000,
      status: 'DRAFT',
      lineItems: [{ description: 'Raw Steel', quantity: 10, unitPrice: 20000, amount: 200000 }],
    });

    // 2. Approve PO
    await PurchasesEngine.approvePurchaseOrder(ORG_ID, po.id);

    // 3. Record Goods Receipt
    const receipt = await PurchasesEngine.createReceipt(ORG_ID, {
      purchaseOrderId: po.id,
      vendorId: vendor.id,
      vendorName: vendor.name,
      status: 'RECEIVED',
    });
    expect(receipt.status).toBe('RECEIVED');

    // 4. Create Partial Bill 1: ₹100,000
    const secondBill = await PurchasesEngine.createAndPostBill(ORG_ID, {
      vendorId: vendor.id,
      vendorName: vendor.name,
      purchaseOrderId: po.id,
      vendorInvoiceNumber: 'BILL-PART-1',
      subtotal: 100000,
      totalAmount: 100000,
    });

    const poCheck1 = await PurchasesEngine.getPurchaseOrder(ORG_ID, po.id);
    expect(poCheck1?.billedAmount).toBe(100000);
    expect(poCheck1?.status).toBe('PARTIALLY_BILLED');

    // 5. Create Remaining Bill 2: ₹100,000
    await PurchasesEngine.createAndPostBill(ORG_ID, {
      vendorId: vendor.id,
      vendorName: vendor.name,
      purchaseOrderId: po.id,
      vendorInvoiceNumber: 'BILL-PART-2',
      subtotal: 100000,
      totalAmount: 100000,
    });

    const poCheck2 = await PurchasesEngine.getPurchaseOrder(ORG_ID, po.id);
    expect(poCheck2?.billedAmount).toBe(200000);
    expect(poCheck2?.status).toBe('BILLED');

    await FinancialDestructiveActionsService.voidBill(
      ORG_ID,
      secondBill.id,
      'purchase-correction-user',
      'Vendor cancelled the remaining purchase-order invoice'
    );
    const poAfterVoid = await PurchasesEngine.getPurchaseOrder(ORG_ID, po.id);
    expect(poAfterVoid?.billedAmount).toBe(100000);
    expect(poAfterVoid?.status).toBe('PARTIALLY_BILLED');
  });

  // -------------------------------------------------------------
  // 3. VENDOR ADVANCE GOLDEN TEST
  // -------------------------------------------------------------
  it('3. Vendor Advance Golden Test: Advance -> Bill -> Apply Advance', async () => {
    const vendor = await PurchasesEngine.createVendor(ORG_ID, { name: 'Metro Logistics' });

    // 1. Record Vendor Advance of ₹50,000
    const adv = await PurchasesEngine.recordVendorAdvance(ORG_ID, {
      vendorId: vendor.id,
      vendorName: vendor.name,
      amount: 50000,
      paidDate: '2026-04-01',
      paidFromAccountId: 'acc-bank-1',
      reference: 'ADV-ML-101',
    });

    expect(adv.unappliedAmount).toBe(50000);

    const v1 = await PurchasesEngine.getVendor(ORG_ID, vendor.id);
    expect(v1?.advanceBalance).toBe(50000);

    // 2. Post Bill of ₹118,000
    const bill = await PurchasesEngine.createAndPostBill(ORG_ID, {
      vendorId: vendor.id,
      vendorName: vendor.name,
      vendorInvoiceNumber: 'INV-ML-551',
      billDate: '2026-04-10',
      subtotal: 100000,
      taxTotal: 18000,
      totalAmount: 118000,
    });

    // 3. Apply Vendor Advance of ₹50,000 to Bill
    const appRes = await PurchasesEngine.applyVendorAdvance(ORG_ID, {
      vendorId: vendor.id,
      advanceId: adv.id,
      billId: bill.id,
      amount: 50000,
      appliedDate: '2026-04-12',
    });

    expect(appRes.newBillBalance).toBe(68000);
    expect(appRes.remainingAdvance).toBe(0);

    const v2 = await PurchasesEngine.getVendor(ORG_ID, vendor.id);
    expect(v2?.advanceBalance).toBe(0);
    expect(v2?.payablesBalance).toBe(68000);
  });

  // -------------------------------------------------------------
  // 4. DUPLICATE VENDOR INVOICE NUMBER GUARD
  // -------------------------------------------------------------
  it('4. Duplicate Vendor Invoice Number Guard prevents duplicate vendor bills', async () => {
    const vendor = await PurchasesEngine.createVendor(ORG_ID, { name: 'Unique Vendor' });

    await PurchasesEngine.createAndPostBill(ORG_ID, {
      vendorId: vendor.id,
      vendorName: vendor.name,
      vendorInvoiceNumber: 'INV-DUP-100',
      subtotal: 50000,
      totalAmount: 50000,
    });

    // Duplicate attempt must fail
    await expect(
      PurchasesEngine.createAndPostBill(ORG_ID, {
        vendorId: vendor.id,
        vendorName: vendor.name,
        vendorInvoiceNumber: 'INV-DUP-100',
        subtotal: 20000,
        totalAmount: 20000,
      })
    ).rejects.toThrow(/Duplicate Vendor Invoice Number/);
  });

  // -------------------------------------------------------------
  // 5. PERIOD LOCK SAFEGUARDS
  // -------------------------------------------------------------
  it('5. Period Lock prevents creating/mutating financial purchase documents in locked period', async () => {
    const vendor = await PurchasesEngine.createVendor(ORG_ID, { name: 'Locked Period Vendor' });

    // Set Period Lock to 2026-05-31
    await db.query(`
      INSERT INTO period_locks (id, organization_id, lock_date, region, locked_by, reason, status)
      VALUES ('lock-p5', '${ORG_ID}', '2026-05-31', 'Global', 'Admin', 'Fiscal Year End Lock', 'Active');
    `);

    // Creating Bill in locked period must fail
    await expect(
      PurchasesEngine.createAndPostBill(ORG_ID, {
        vendorId: vendor.id,
        vendorName: vendor.name,
        vendorInvoiceNumber: 'INV-LOCK-1',
        billDate: '2026-05-15',
        subtotal: 10000,
        totalAmount: 10000,
      })
    ).rejects.toThrow(/locked accounting period/);
  });

  // -------------------------------------------------------------
  // 6. TENANT ISOLATION
  // -------------------------------------------------------------
  it('6. Tenant isolation ensures Org A purchases data cannot leak into Org B', async () => {
    const vendorA = await PurchasesEngine.createVendor(ORG_ID, { name: 'Org A Vendor' });

    const billA = await PurchasesEngine.createAndPostBill(ORG_ID, {
      vendorId: vendorA.id,
      vendorName: vendorA.name,
      vendorInvoiceNumber: 'ORGA-BILL-01',
      subtotal: 30000,
      totalAmount: 30000,
    });

    // Org B attempting to view Org A's bill should return null
    const crossBill = await PurchasesEngine.getBill(ORG_B, billA.id);
    expect(crossBill).toBeNull();
  });

  // -------------------------------------------------------------
  // 7. AP AGING & VENDOR STATEMENT OF ACCOUNT
  // -------------------------------------------------------------
  it('7. AP Aging & Vendor Statement of Account generate accurate financial reports', async () => {
    const vendor = await PurchasesEngine.createVendor(ORG_ID, { name: 'Reporting Vendor' });

    await PurchasesEngine.createAndPostBill(ORG_ID, {
      vendorId: vendor.id,
      vendorName: vendor.name,
      vendorInvoiceNumber: 'REP-BILL-1',
      billDate: '2026-03-01',
      dueDate: '2026-03-31',
      subtotal: 50000,
      totalAmount: 50000,
    });

    const aging = await PurchasesEngine.getAPAgingReport(ORG_ID, '2026-04-15');
    expect(aging.totals.total).toBe(50000);

    const stmt = await PurchasesEngine.getVendorStatement(ORG_ID, vendor.id);
    expect(stmt.totalDebits).toBe(50000);
    expect(stmt.netBalanceDue).toBe(50000);
  });
});
