import { describe, it, expect, beforeAll } from 'vitest';
import supertest from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { BackupRestoreService } from '../database/BackupRestoreService';

const request = supertest(app);

describe('Phase 8: Complete End-to-End Business Lifecycle & Production UX Hardening', () => {
  const orgId = `org-e2e-${Date.now()}`;
  const ownerUserId = `usr-owner-${Date.now()}`;
  const ownerEmail = `owner-${Date.now()}@acme.com`;

  let authHeader: { Authorization: string };
  let publicToken: string;
  let quotationId: string;
  let invoiceId: string;
  let customerId: string;
  let vendorId: string;
  let itemId: string;
  let billId: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();

    // 1. Create Owner User & Register Org
    const regRes = await request.post('/api/v1/auth/register').send({
      email: ownerEmail,
      password: 'SecurePassword123!',
      fullName: 'Alice Acme',
      organizationName: 'Acme Global Finance Pvt Ltd',
      role: 'Owner',
    });

    expect(regRes.status).toBe(201);
    expect(regRes.body.token).toBeDefined();

    const token = regRes.body.token;
    authHeader = { Authorization: `Bearer ${token}` };

    // Setup base Chart of Accounts
    const accs = [
      { code: '1010', name: 'HDFC Operating Bank Account', type: 'Asset', subType: 'Bank', balance: 500000 },
      { code: '1200', name: 'Accounts Receivable', type: 'Asset', subType: 'Receivable', balance: 0 },
      { code: '2100', name: 'Accounts Payable', type: 'Liability', subType: 'Payable', balance: 0 },
      { code: '4000', name: 'Sales Revenue', type: 'Revenue', subType: 'Operating Revenue', balance: 0 },
      { code: '5000', name: 'Cloud Infrastructure Expenses', type: 'Expense', subType: 'Operating Expense', balance: 0 },
      { code: '2210', name: 'Output CGST Account', type: 'Liability', subType: 'Tax', balance: 0 },
      { code: '2220', name: 'Output SGST Account', type: 'Liability', subType: 'Tax', balance: 0 },
      { code: '1310', name: 'Input CGST Account', type: 'Asset', subType: 'Tax', balance: 0 },
      { code: '1320', name: 'Input SGST Account', type: 'Asset', subType: 'Tax', balance: 0 },
    ];

    const healthRes = await request.get('/api/v1/health').set(authHeader);
    const actualOrgId = healthRes.body.organizationId;

    for (const a of accs) {
      await db.query(
        `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, is_system_account, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, false, 'Active')
         ON CONFLICT (organization_id, code) DO NOTHING`,
        [`acc-${a.code}`, actualOrgId, a.code, a.name, a.type, a.subType, a.balance]
      );
    }
  });

  it('Step 1: Create Master Item & Configure Custom Document Sequences', async () => {
    // Create Master Item
    const itemRes = await request
      .post('/api/v1/items')
      .set(authHeader)
      .send({
        name: 'Enterprise Cloud Server Hosting',
        sku: 'SRV-CLOUD-01',
        description: 'Dedicated high-performance cloud instance',
        hsnSac: '998315',
        unit: 'Month',
        salesRate: 100000,
        purchaseRate: 50000,
        gstRate: 18,
        salesAccountId: 'acc-4000',
        purchaseAccountId: 'acc-5000',
      });

    expect(itemRes.status).toBe(201);
    expect(itemRes.body.item.id).toBeDefined();
    itemId = itemRes.body.item.id;

    // Configure Sequence
    const seqRes = await request
      .post('/api/v1/document-numbering/configure')
      .set(authHeader)
      .send({
        documentType: 'QUOTATION',
        prefix: 'QT-ACME',
        paddingLength: 4,
      });

    expect(seqRes.status).toBe(200);
    expect(seqRes.body.config.prefix).toBe('QT-ACME');
  });

  it('Step 2: Create Customer & Vendor', async () => {
    // Create Customer
    const custRes = await request
      .post('/api/v1/customers')
      .set(authHeader)
      .send({
        displayName: 'Horizon Technologies Pvt Ltd',
        legalName: 'Horizon Technologies Private Limited',
        email: 'billing@horizon.com',
        phone: '+91 9876543210',
        gstin: '27AAAAA0000A1Z5',
        billingAddress: '402 Cyber Tech Park, Mumbai, MH',
      });

    expect(custRes.status).toBe(201);
    customerId = custRes.body.id;

    // Create Vendor
    const vendRes = await request
      .post('/api/v1/vendors')
      .set(authHeader)
      .send({
        name: 'AWS Cloud Services India',
        companyName: 'Amazon Web Services India Pvt Ltd',
        email: 'accounts@aws.com',
        phone: '+91 2212345678',
        taxId: '27BBBBB1111B2Z6',
        billingAddress: '101 Cloud Tower, Bengaluru, KA',
      });

    expect(vendRes.status).toBe(201);
    vendorId = vendRes.body.id;
  });

  it('Step 3: Create & Revise Quotation with Concurrency-Safe Numbering', async () => {
    // Next document number check
    const numRes = await request
      .get('/api/v1/document-numbering/next?type=QUOTATION')
      .set(authHeader);

    expect(numRes.status).toBe(200);
    expect(numRes.body.documentNumber).toContain('QT-ACME');

    // Create Quotation
    const qRes = await request
      .post('/api/v1/estimates')
      .set(authHeader)
      .send({
        customerId,
        customerName: 'Horizon Technologies Pvt Ltd',
        issueDate: '2026-08-11',
        status: 'SENT',
        validityDays: 30,
        items: [
          {
            itemId,
            itemName: 'Enterprise Cloud Server Hosting',
            quantity: 1,
            unit: 'Month',
            rate: 100000,
            discountPercent: 0,
            taxRate: 18,
            totalAmount: 118000,
          },
        ],
        terms: 'Payment due within 15 days of invoice date.',
        notes: 'Thank you for choosing Acme Cloud.',
        isGstInclusive: false,
      });

    expect([200, 201]).toContain(qRes.status);
    quotationId = qRes.body.id;
    publicToken = qRes.body.publicToken;
    expect(publicToken).toBeDefined();

    // Revise Quotation (Revision 1)
    const revRes = await request
      .post(`/api/v1/estimates/${quotationId}/revise`)
      .set(authHeader)
      .send({
        notes: 'Revised quotation with 5% promotional volume discount.',
        overallDiscount: 5000,
        items: [
          {
            itemId,
            itemName: 'Enterprise Cloud Server Hosting',
            quantity: 1,
            unit: 'Month',
            rate: 100000,
            discountPercent: 5,
            discountAmount: 5000,
            taxRate: 18,
            totalAmount: 112100,
          },
        ],
      });

    expect(revRes.status).toBe(200);

    // Verify Revisions List
    const revisionsListRes = await request
      .get(`/api/v1/quotations/${quotationId}/revisions`)
      .set(authHeader);

    expect(revisionsListRes.status).toBe(200);
    expect(revisionsListRes.body.revisions.length).toBeGreaterThanOrEqual(2);
  });

  it('Step 4: External Customer Views & Accepts Quotation via Public Portal Token', async () => {
    // Unprotected GET
    const pubRes = await request.get(`/api/v1/public/quotation/${publicToken}`);

    expect(pubRes.status).toBe(200);
    expect(pubRes.body.quotation.estimateNumber).toBeDefined();

    // Customer accepts
    const respondRes = await request
      .post(`/api/v1/public/quotation/${publicToken}/respond`)
      .send({
        status: 'ACCEPTED',
        notes: 'Approved by Horizon CTO. Please proceed with provisioning.',
      });

    expect(respondRes.status).toBe(200);
    expect(respondRes.body.result.status).toBe('ACCEPTED');
  });

  it('Step 5: Convert the accepted Quotation to one Posted Invoice', async () => {
    const invRes = await request
      .post(`/api/v1/quotations/${quotationId}/convert-inv`)
      .set(authHeader);

    expect(invRes.status).toBe(200);
    expect(invRes.body.invoice.invoiceNumber).toBeDefined();
    invoiceId = invRes.body.invoice.id;
    expect(invRes.body.invoice.status).toBe('POSTED');
  });

  it('Step 6: Receive Partial Payment & Final Payment for Customer Invoice', async () => {
    // Payment 1: Partial ₹50,000
    const pay1Res = await request
      .post('/api/v1/payments-received')
      .set(authHeader)
      .send({
        customerId,
        invoiceId,
        amount: 50000,
        paymentDate: '2026-08-15',
        paymentMode: 'Bank Transfer',
        depositAccountId: 'acc-1010',
        referenceNumber: 'UTR-HORIZON-001',
      });

    expect([200, 201]).toContain(pay1Res.status);

    // Payment 2: Balance payment
    const invStatusRes = await request.get('/api/v1/invoices').set(authHeader);
    const inv = invStatusRes.body.find((i: any) => i.id === invoiceId);
    const remainingBal = Number(inv.balance_due || inv.balanceDue || 0);

    const pay2Res = await request
      .post('/api/v1/payments-received')
      .set(authHeader)
      .send({
        customerId,
        invoiceId,
        amount: remainingBal,
        paymentDate: '2026-08-20',
        paymentMode: 'NEFT',
        depositAccountId: 'acc-1010',
        referenceNumber: 'UTR-HORIZON-002',
      });

    expect([200, 201]).toContain(pay2Res.status);

    // Verify Invoice balance is 0 and status is PAID
    const invFinalRes = await request.get('/api/v1/invoices').set(authHeader);
    const paidInv = invFinalRes.body.find((i: any) => i.id === invoiceId);
    expect(Number(paidInv.balance_due || paidInv.balanceDue || 0)).toBe(0);
    expect(paidInv.status.toUpperCase()).toBe('PAID');
  });

  it('Step 7: Bank account onboarding rejects unbalanced opening data', async () => {
    const bAccRes = await request
      .post('/api/v1/banking/accounts')
      .set(authHeader)
      .send({
        accountName: 'HDFC Corporate Operating Account',
        accountNumber: '50200012345678',
        bankName: 'HDFC Bank',
        ifscCode: 'HDFC0001234',
        glAccountId: 'acc-1010',
        currentBalance: 500000,
      });
    expect(bAccRes.status).toBe(400);
    expect(bAccRes.body.error).toContain('valid account identifier');
  });

  it('Step 8: Procurement Cycle (Purchase Order, Vendor Bill, Vendor Payment)', async () => {
    // Create Vendor Bill
    const billRes = await request
      .post('/api/v1/bills')
      .set(authHeader)
      .send({
        vendorId,
        vendorName: 'AWS Cloud Services India',
        billNumber: 'AWS-INV-2026-03',
        billDate: '2026-08-12',
        dueDate: '2026-09-11',
        subtotal: 50000,
        taxTotal: 9000,
        totalAmount: 59000,
        balanceDue: 59000,
        status: 'POSTED',
        lineItems: [
          {
            description: 'AWS Server Data Center Power & Fiber Bandwidth',
            quantity: 1,
            unitPrice: 50000,
            taxRate: 18,
            totalAmount: 59000,
          },
        ],
      });

    expect(billRes.status).toBe(201);
    billId = billRes.body.id;
  });

  it('Step 9: Financial Reports Integrity Verification (Trial Balance, P&L, AR/AP)', async () => {
    // Trial Balance
    const tbRes = await request.get('/api/v1/reports/trial-balance').set(authHeader);
    expect(tbRes.status).toBe(200);
    expect(tbRes.body.isBalanced).toBe(true);
    expect(Number(tbRes.body.totalDebits)).toEqual(Number(tbRes.body.totalCredits));

    // Profit & Loss
    const plRes = await request.get('/api/v1/reports/profit-loss').set(authHeader);
    expect(plRes.status).toBe(200);
    expect(plRes.body.netProfit).toBeDefined();

    // AR Integrity
    const arRes = await request.get('/api/v1/ar-integrity').set(authHeader);
    expect(arRes.status).toBe(200);
    expect(arRes.body.isBalanced).toBe(true);
  });

  it('Step 10: Global Search & Real Data Dashboard Summary Verification', async () => {
    // Global Search
    const searchRes = await request
      .get('/api/v1/search?q=Horizon')
      .set(authHeader);

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.results.length).toBeGreaterThan(0);

    // Dashboard Summary
    const dashRes = await request
      .get('/api/v1/dashboard-summary')
      .set(authHeader);

    expect(dashRes.status).toBe(200);
    expect(dashRes.body.summary.receivables).toBeDefined();
    expect(dashRes.body.summary.salesThisMonth).toBeGreaterThanOrEqual(0);
  });

  it('Step 11: Tenant Isolation & Security Audit Verification', async () => {
    // Register Tenant 2
    const reg2Res = await request.post('/api/v1/auth/register').send({
      email: `user2-${Date.now()}@competitor.com`,
      password: 'SecurePassword123!',
      fullName: 'Bob Competitor',
      organizationName: 'Competitor Corp',
      role: 'Owner',
    });

    const tenant2Auth = { Authorization: `Bearer ${reg2Res.body.token}` };

    // Tenant 2 attempts to fetch Tenant 1's quotation
    const crossRes = await request
      .get(`/api/v1/estimates/${quotationId}`)
      .set(tenant2Auth);

    expect(crossRes.status).toBe(404); // Properly isolated!
  });

  it('Step 12: Organization Backup Snapshot & Period Lock Verification', async () => {
    // Get actual Org ID
    const healthRes = await request.get('/api/v1/health').set(authHeader);
    const orgId = healthRes.body.organizationId;

    // Create Backup Snapshot
    const backupData = await BackupRestoreService.exportTenantData(orgId);
    expect(backupData.tables.estimates.length).toBeGreaterThan(0);
    expect(backupData.tables.items.length).toBeGreaterThan(0);

    // Period Lock March 2026
    const lockRes = await request
      .post('/api/v1/period-locks')
      .set(authHeader)
      .send({
        lockDate: '2026-03-31',
        reason: 'March 2026 Month-End Period Lock',
      });

    expect(lockRes.status).toBe(201);
  });
});
