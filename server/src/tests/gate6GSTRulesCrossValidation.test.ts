import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../database/db';
import { newId } from '../utils/ids';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';
import { GSTComplianceService } from '../services/GSTComplianceService';
import { AccountingIntegrityService } from '../services/AccountingIntegrityService';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { centsToSafeNumber, databaseMoneyToCents } from '../utils/money';

describe('Gate 6: GST Compliance & Multi-Tier Tax Return Cross-Validation Suite', () => {
  const ORG_ID = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
  const PERIOD_KEY = '2026-05';

  const customerSameState = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id; // AP
  const customerInterState = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A2.id; // TG
  const customerUnregistered = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A3.id; // B2C

  const vendorSameState = MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id; // AP
  const vendorInterState = MASTER_FIXTURE_CONSTANTS.VENDORS.A2.id; // TG

  beforeAll(async () => {
    await MasterFinanceFixture.reset();

    // 1. Post Intra-State (AP -> AP) Invoices across all tax slabs
    // 5% Slab: 10,000 subtotal -> CGST 250 + SGST 250 = 500 tax
    await SalesEngine.createAndPostInvoice(ORG_ID, {
      invoiceNumber: 'INV-GST-005',
      customerId: customerSameState,
      issueDate: '2026-05-05',
      subtotal: 10000.00,
      taxTotal: 500.00,
      totalAmount: 10500.00,
      lineItems: [
        {
          id: newId('gst-item'),
          description: '5% Construction Aggregates',
          quantity: 10,
          unitPrice: 1000.00,
          taxRate: 5,
          taxAmount: 500.00,
          totalAmount: 10500.00,
        },
      ],
    });

    // 12% Slab: 20,000 subtotal -> CGST 1200 + SGST 1200 = 2400 tax
    await SalesEngine.createAndPostInvoice(ORG_ID, {
      invoiceNumber: 'INV-GST-012',
      customerId: customerSameState,
      issueDate: '2026-05-08',
      subtotal: 20000.00,
      taxTotal: 2400.00,
      totalAmount: 22400.00,
      lineItems: [
        {
          id: newId('gst-item'),
          description: '12% Wooden Mouldings',
          quantity: 8,
          unitPrice: 2500.00,
          taxRate: 12,
          taxAmount: 2400.00,
          totalAmount: 22400.00,
        },
      ],
    });

    // 18% Slab: 50,000 subtotal -> CGST 4500 + SGST 4500 = 9000 tax
    await SalesEngine.createAndPostInvoice(ORG_ID, {
      invoiceNumber: 'INV-GST-018',
      customerId: customerSameState,
      issueDate: '2026-05-12',
      subtotal: 50000.00,
      taxTotal: 9000.00,
      totalAmount: 59000.00,
      lineItems: [
        {
          id: newId('gst-item'),
          description: '18% Commercial Plywood',
          quantity: 12.5,
          unitPrice: 4000.00,
          taxRate: 18,
          taxAmount: 9000.00,
          totalAmount: 59000.00,
        },
      ],
    });

    // 28% Slab: 100,000 subtotal -> CGST 14000 + SGST 14000 = 28000 tax
    await SalesEngine.createAndPostInvoice(ORG_ID, {
      invoiceNumber: 'INV-GST-028',
      customerId: customerSameState,
      issueDate: '2026-05-15',
      subtotal: 100000.00,
      taxTotal: 28000.00,
      totalAmount: 128000.00,
      lineItems: [
        {
          id: newId('gst-item'),
          description: '28% Luxury Panelling',
          quantity: 10,
          unitPrice: 10000.00,
          taxRate: 28,
          taxAmount: 28000.00,
          totalAmount: 128000.00,
        },
      ],
    });

    // 2. Post Inter-State (AP -> TG) Invoices (IGST)
    // 18% Inter-state: 60,000 subtotal -> IGST 10800
    await SalesEngine.createAndPostInvoice(ORG_ID, {
      invoiceNumber: 'INV-GST-IGST-01',
      customerId: customerInterState,
      issueDate: '2026-05-18',
      subtotal: 60000.00,
      taxTotal: 10800.00,
      totalAmount: 70800.00,
      lineItems: [
        {
          id: newId('gst-item'),
          description: '3D Visualization (Inter-state)',
          quantity: 2,
          unitPrice: 30000.00,
          taxRate: 18,
          taxAmount: 10800.00,
          totalAmount: 70800.00,
        },
      ],
    });

    // 3. Post B2C Unregistered Consumer Invoice (missing GSTIN)
    await SalesEngine.createAndPostInvoice(ORG_ID, {
      invoiceNumber: 'INV-GST-B2C-01',
      customerId: customerUnregistered,
      issueDate: '2026-05-20',
      subtotal: 5000.00,
      taxTotal: 900.00,
      totalAmount: 5900.00,
      lineItems: [
        {
          id: newId('gst-item'),
          description: 'Consultation Services',
          quantity: 1,
          unitPrice: 5000.00,
          taxRate: 18,
          taxAmount: 900.00,
          totalAmount: 5900.00,
        },
      ],
    });

    // 4. Post Vendor Bills (Inward GST)
    // Bill 1: 40,000 subtotal + 18% GST (7,200)
    await PurchasesEngine.createAndPostBill(ORG_ID, {
      billNumber: 'BILL-GST-01',
      vendorId: vendorSameState,
      billDate: '2026-05-10',
      subtotal: 40000.00,
      taxTotal: 7200.00,
      totalAmount: 47200.00,
      lineItems: [
        {
          id: newId('gst-item'),
          description: 'Raw Timber Batch',
          quantity: 40,
          unitPrice: 1000.00,
          taxRate: 18,
          taxAmount: 7200.00,
          totalAmount: 47200.00,
        },
      ],
    });

    // Bill 2: 30,000 subtotal + 12% GST (3,600)
    await PurchasesEngine.createAndPostBill(ORG_ID, {
      billNumber: 'BILL-GST-02',
      vendorId: vendorInterState,
      billDate: '2026-05-14',
      subtotal: 30000.00,
      taxTotal: 3600.00,
      totalAmount: 33600.00,
      lineItems: [
        {
          id: newId('gst-item'),
          description: 'Specialty Laminates',
          quantity: 15,
          unitPrice: 2000.00,
          taxRate: 12,
          taxAmount: 3600.00,
          totalAmount: 33600.00,
        },
      ],
    });
  });

  // =========================================================================
  // 1. GST RETURN SUMMARY & CROSS-DOCUMENT INTEGRITY
  // =========================================================================
  describe('1. GST Return Summary & Outward/Inward Classification', () => {
    it('computes exact outward taxable turnover, tax amount, and document counts', async () => {
      const summary = await GSTComplianceService.getReturnSummary(ORG_ID, PERIOD_KEY);

      expect(summary.periodKey).toBe(PERIOD_KEY);
      expect(summary.periodStart).toBe('2026-05-01');
      expect(summary.periodEnd).toBe('2026-05-31');

      // Outward documents: 6 posted invoices
      // Subtotal = 10k + 20k + 50k + 100k + 60k + 5k = 245,000
      // Tax Amount = 500 + 2400 + 9000 + 28000 + 10800 + 900 = 51,600
      expect(summary.outward.documentCount).toBe(6);
      expect(summary.outward.taxableValue).toBe(245000.00);
      expect(summary.outward.taxAmount).toBe(51600.00);

      // Inward documents: 2 posted bills
      // Subtotal = 40k + 30k = 70,000
      // Tax Amount = 7200 + 3600 = 10,800
      expect(summary.inward.documentCount).toBe(2);
      expect(summary.inward.taxableValue).toBe(70000.00);
      expect(summary.inward.taxAmount).toBe(10800.00);

      // Net Tax Position: Output Tax (51,600) - Input Tax (10,800) = 40,800 Payable
      expect(summary.netTaxPosition).toBe(40800.00);
    });

    it('identifies unregistered B2C transactions with missing customer GSTIN', async () => {
      const summary = await GSTComplianceService.getReturnSummary(ORG_ID, PERIOD_KEY);

      // 1 invoice was issued to unregistered customer without GSTIN
      expect(summary.outward.missingGstinCount).toBe(1);
    });

    it('verifies GST control accounts strictly reconcile with document tax totals', async () => {
      const summary = await GSTComplianceService.getReturnSummary(ORG_ID, PERIOD_KEY);
      const integrity = await AccountingIntegrityService.verifyGSTIntegrity(ORG_ID);

      expect(summary.integrity.isBalanced).toBe(true);
      expect(summary.integrity.difference).toBe(0);
      expect(integrity.isBalanced).toBe(true);
      expect(integrity.difference).toBe('0.00');
    });
  });

  // =========================================================================
  // 2. GST TAX SLAB CONSERVATION
  // =========================================================================
  describe('2. Multi-Slab Tax Breakdown & GL Equality', () => {
    it('proves GL Output GST (2100/2200) equals exact sum of all invoice line taxes', async () => {
      const glOutputRes = await db.query(
        `SELECT COALESCE(SUM(jl.credit - jl.debit), 0) as balance
         FROM journal_lines jl
         JOIN journal_entries je ON jl.journal_entry_id = je.id
         JOIN accounts a ON a.id = jl.account_id
         WHERE je.organization_id = $1 AND a.code IN ('2100', '2200') AND UPPER(je.status) = 'POSTED'`,
        [ORG_ID]
      );

      const invTaxRes = await db.query(
        `SELECT COALESCE(SUM(tax_total), 0) as total
         FROM invoices
         WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`,
        [ORG_ID]
      );

      expect(Number(glOutputRes.rows[0].balance)).toBe(51600.00);
      expect(Number(invTaxRes.rows[0].total)).toBe(51600.00);
    });

    it('proves GL Input GST (1200/2110) equals exact sum of all bill line taxes', async () => {
      const glInputRes = await db.query(
        `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) as balance
         FROM journal_lines jl
         JOIN journal_entries je ON jl.journal_entry_id = je.id
         JOIN accounts a ON a.id = jl.account_id
         WHERE je.organization_id = $1 AND a.code IN ('1200', '2110') AND UPPER(je.status) = 'POSTED'`,
        [ORG_ID]
      );

      const billTaxRes = await db.query(
        `SELECT COALESCE(SUM(tax_total), 0) as total
         FROM bills
         WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`,
        [ORG_ID]
      );

      expect(Number(glInputRes.rows[0].balance)).toBe(10800.00);
      expect(Number(billTaxRes.rows[0].total)).toBe(10800.00);
    });
  });
});
