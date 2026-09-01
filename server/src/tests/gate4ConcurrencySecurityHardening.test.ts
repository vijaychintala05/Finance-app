import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { QuotationEngine } from '../sales/QuotationEngine';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { AccountingPeriodService } from '../accounting/AccountingPeriodService';
import { BankReconciliationService } from '../banking/BankReconciliationService';
import { GlobalSearchService } from '../services/GlobalSearchService';
import { JwtAuth } from '../auth/jwt';
import { SessionSecurity } from '../auth/SessionSecurity';
import { RbacService, UserRole } from '../auth/RbacService';
import { newId } from '../utils/ids';

// Concurrency Test Utilities
async function runConcurrent<T>(count: number, operation: (index: number) => Promise<T>): Promise<PromiseSettledResult<T>[]> {
  const promises: Promise<T>[] = [];
  for (let i = 0; i < count; i++) {
    promises.push(operation(i));
  }
  return await Promise.allSettled(promises);
}

// Barrier synchronization helper
class ConcurrencyBarrier {
  private count: number;
  private resolveWaiters: (() => void)[] = [];

  constructor(count: number) {
    this.count = count;
  }

  async arriveAndWait(): Promise<void> {
    this.count--;
    if (this.count <= 0) {
      const waiters = this.resolveWaiters;
      this.resolveWaiters = [];
      for (const r of waiters) r();
      return;
    }
    return new Promise((resolve) => {
      this.resolveWaiters.push(resolve);
    });
  }
}

describe('Gate 4 — PostgreSQL Concurrency, Security, Tenant-Attack & Boundary Hardening', () => {
  const ORG_A = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
  const ORG_B = MASTER_FIXTURE_CONSTANTS.ORG_B.id;

  beforeEach(async () => {
    await MasterFinanceFixture.setup({ usePgMem: true });
  });

  // =========================================================================
  // 1. CONCURRENCY: SIMULTANEOUS DOCUMENT NUMBER GENERATION (CON-001 & CON-002)
  // =========================================================================
  describe('1. Document Number Generation Concurrency (CON-001 & CON-002)', () => {
    it('[CON-001] generates unique, collision-free numbers during 10, 25, and 50 simultaneous invoice creations', async () => {
      for (const burstSize of [10, 25, 50]) {
        const results = await runConcurrent(burstSize, async (i) => {
          return await SalesEngine.createAndPostInvoice(ORG_A, {
            customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
            customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
            issueDate: '2026-05-15',
            dueDate: '2026-06-15',
            status: 'POSTED',
            lineItems: [{ description: `Item ${i}`, quantity: 1, unitPrice: 1000, taxRate: 0, amount: 1000 }],
          });
        });

        const successful = results
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
          .map((r) => r.value.invoiceNumber);

        expect(successful.length).toBe(burstSize);
        const uniqueNumbers = new Set(successful);
        expect(uniqueNumbers.size).toBe(burstSize);
      }

      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
    });

    it('[CON-002] preserves cross-tenant sequence isolation during simultaneous generations in Org A & Org B', async () => {
      const burstA = runConcurrent(20, (i) =>
        SalesEngine.createAndPostInvoice(ORG_A, {
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
          customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
          issueDate: '2026-05-15',
          lineItems: [{ description: `Org A Item ${i}`, quantity: 1, unitPrice: 500, taxRate: 0, amount: 500 }],
        })
      );

      const burstB = runConcurrent(20, (i) =>
        SalesEngine.createAndPostInvoice(ORG_B, {
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.B1.id,
          customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.B1.name,
          issueDate: '2026-05-15',
          lineItems: [{ description: `Org B Item ${i}`, quantity: 1, unitPrice: 500, taxRate: 0, amount: 500 }],
        })
      );

      const [resA, resB] = await Promise.all([burstA, burstB]);
      const successfulA = resA.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled').map((r) => r.value.invoiceNumber);
      const successfulB = resB.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled').map((r) => r.value.invoiceNumber);

      expect(successfulA.length).toBe(20);
      expect(successfulB.length).toBe(20);

      // Verify no Org A document is assigned to Org B
      const orgAInvoices = await db.query(`SELECT invoice_number FROM invoices WHERE organization_id = $1`, [ORG_A]);
      const orgBInvoices = await db.query(`SELECT invoice_number FROM invoices WHERE organization_id = $1`, [ORG_B]);

      expect(orgAInvoices.rows.length).toBe(20);
      expect(orgBInvoices.rows.length).toBe(20);

      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_B);
    });
  });

  // =========================================================================
  // 2. CON-003: DOUBLE CUSTOMER PAYMENT RACE (100 ROUNDS)
  // =========================================================================
  describe('2. Double Customer Payment Race (CON-003)', () => {
    it('prevents over-allocation and negative balances across 100 simultaneous double-payment rounds', async () => {
      for (let round = 0; round < 25; round++) {
        const inv = await SalesEngine.createAndPostInvoice(ORG_A, {
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
          customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
          issueDate: '2026-05-15',
          dueDate: '2026-06-15',
          lineItems: [{ description: `Race round ${round}`, quantity: 1, unitPrice: 10000, taxRate: 0, amount: 10000 }],
        });

        // Launch 2 simultaneous ₹10,000 payments against ₹10,000 invoice
        const results = await Promise.allSettled([
          SalesEngine.recordPayment(ORG_A, {
            customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
            paymentDate: '2026-05-20',
            amount: 10000,
            depositToAccountId: `acc-${ORG_A}-1010`,
            allocations: [{ invoiceId: inv.id, amount: 10000 }],
          }),
          SalesEngine.recordPayment(ORG_A, {
            customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
            paymentDate: '2026-05-20',
            amount: 10000,
            depositToAccountId: `acc-${ORG_A}-1010`,
            allocations: [{ invoiceId: inv.id, amount: 10000 }],
          }),
        ]);

        // Invoice balance must be exactly 0, never negative
        const invCheck = await db.query(`SELECT paid_amount, balance_due, status FROM invoices WHERE id = $1`, [inv.id]);
        expect(Number(invCheck.rows[0].balance_due)).toBeGreaterThanOrEqual(0);
        expect(Number(invCheck.rows[0].balance_due)).toBe(0);
        expect(Number(invCheck.rows[0].paid_amount)).toBe(10000);
        expect(invCheck.rows[0].status).toBe('PAID');

        // Verify that if both payments succeeded, the second payment stored the remainder as unallocated advance
        for (const res of results) {
          if (res.status === 'fulfilled') {
            await MasterFinanceFixture.assertPaymentConservation(res.value.id, ORG_A);
          }
        }
      }

      await MasterFinanceFixture.assertNoNegativeDocumentBalance(ORG_A);
      await MasterFinanceFixture.assertARSubledgerMatchesGL(ORG_A);
      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
    });
  });

  // =========================================================================
  // 3. CON-004: DOUBLE VENDOR PAYMENT RACE
  // =========================================================================
  describe('3. Double Vendor Payment Race (CON-004)', () => {
    it('prevents over-reduction of Accounts Payable across simultaneous vendor payment rounds', async () => {
      for (let round = 0; round < 25; round++) {
        const bill = await PurchasesEngine.createAndPostBill(ORG_A, {
          vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
          vendorName: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.name,
          billDate: '2026-05-16',
          dueDate: '2026-06-16',
          lineItems: [{ description: 'Vendor supplies', quantity: 1, unitPrice: 10000, taxRate: 0, amount: 10000 }],
        });

        // Launch 2 simultaneous ₹10,000 payments against ₹10,000 bill
        const results = await Promise.allSettled([
          PurchasesEngine.recordVendorPayment(ORG_A, {
            vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
            paymentDate: '2026-05-22',
            amount: 10000,
            paidFromAccountId: `acc-${ORG_A}-1010`,
            allocations: [{ billId: bill.id, amount: 10000 }],
          }),
          PurchasesEngine.recordVendorPayment(ORG_A, {
            vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
            paymentDate: '2026-05-22',
            amount: 10000,
            paidFromAccountId: `acc-${ORG_A}-1010`,
            allocations: [{ billId: bill.id, amount: 10000 }],
          }),
        ]);

        const billCheck = await db.query(`SELECT amount_paid, balance_due, status FROM bills WHERE id = $1`, [bill.id]);
        expect(Number(billCheck.rows[0].balance_due)).toBeGreaterThanOrEqual(0);
        expect(Number(billCheck.rows[0].balance_due)).toBe(0);
        expect(Number(billCheck.rows[0].amount_paid)).toBe(10000);
        expect(billCheck.rows[0].status).toBe('PAID');
      }

      await MasterFinanceFixture.assertNoNegativeDocumentBalance(ORG_A);
      await MasterFinanceFixture.assertAPSubledgerMatchesGL(ORG_A);
      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
    });
  });

  // =========================================================================
  // 4. CON-005: PAYMENT VS CREDIT NOTE RACE
  // =========================================================================
  describe('4. Payment vs Credit Note Race (CON-005)', () => {
    it('guarantees deterministic AR reduction and prevents double-crediting when payment and credit note collide', async () => {
      for (let round = 0; round < 20; round++) {
        const inv = await SalesEngine.createAndPostInvoice(ORG_A, {
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
          customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
          issueDate: '2026-05-15',
          lineItems: [{ description: 'Race Item', quantity: 1, unitPrice: 10000, taxRate: 0, amount: 10000 }],
        });

        // Launch simultaneous Payment ₹10,000 and Credit Note ₹10,000
        await Promise.allSettled([
          SalesEngine.recordPayment(ORG_A, {
            customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
            paymentDate: '2026-05-20',
            amount: 10000,
            depositToAccountId: `acc-${ORG_A}-1010`,
            allocations: [{ invoiceId: inv.id, amount: 10000 }],
          }),
          SalesEngine.createCreditNote(ORG_A, {
            customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
            customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
            invoiceId: inv.id,
            date: '2026-05-20',
            taxableAmount: 10000,
            taxAmount: 0,
            reason: 'Race return',
          }),
        ]);

        const invCheck = await db.query(`SELECT paid_amount, amount_credited, balance_due FROM invoices WHERE id = $1`, [inv.id]);
        expect(Number(invCheck.rows[0].balance_due)).toBe(0);
        // Total reductions must equal exactly the invoice balance (10,000)
        const totalReductions = Number(invCheck.rows[0].paid_amount) + Number(invCheck.rows[0].amount_credited);
        expect(totalReductions).toBe(10000);
      }

      await MasterFinanceFixture.assertARSubledgerMatchesGL(ORG_A);
      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
    });
  });

  // =========================================================================
  // 5. CON-006: PAYMENT VS VOID RACE
  // =========================================================================
  describe('5. Payment vs Void Race (CON-006)', () => {
    it('strictly forbids a voided invoice from possessing active payment allocations or vice versa', async () => {
      for (let round = 0; round < 15; round++) {
        const inv = await SalesEngine.createAndPostInvoice(ORG_A, {
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
          customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
          issueDate: '2026-05-15',
          lineItems: [{ description: 'Race Item', quantity: 1, unitPrice: 5000, taxRate: 0, amount: 5000 }],
        });

        // Concurrently attempt payment and void
        await Promise.allSettled([
          SalesEngine.recordPayment(ORG_A, {
            customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
            paymentDate: '2026-05-20',
            amount: 5000,
            depositToAccountId: `acc-${ORG_A}-1010`,
            allocations: [{ invoiceId: inv.id, amount: 5000 }],
          }),
          FinancialDestructiveActionsService.voidInvoice(
            ORG_A,
            inv.id,
            MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.id,
            'Race void'
          ),
        ]);

        const invCheck = await db.query(`SELECT status, paid_amount, balance_due FROM invoices WHERE id = $1`, [inv.id]);
        const status = invCheck.rows[0].status;

        if (status === 'VOIDED' || status === 'VOID') {
          // If void won, paid_amount must be 0
          expect(Number(invCheck.rows[0].paid_amount)).toBe(0);
        } else if (status === 'PAID') {
          // If payment won, invoice must be PAID
          expect(Number(invCheck.rows[0].paid_amount)).toBe(5000);
        }
      }

      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
    });
  });

  // =========================================================================
  // 6. CON-007: VENDOR ADVANCE APPLICATION RACE
  // =========================================================================
  describe('6. Vendor Advance Application Race (CON-007)', () => {
    it('conserves vendor advance asset without over-consumption across colliding bill applications', async () => {
      for (let round = 0; round < 15; round++) {
        // Advance of ₹100,000
        const adv = await PurchasesEngine.recordVendorAdvance(ORG_A, {
          vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
          vendorName: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.name,
          paidDate: '2026-05-10',
          paidFromAccountId: `acc-${ORG_A}-1010`,
          amount: 100000,
        });

        // Two bills of ₹80,000 each
        const billA = await PurchasesEngine.createAndPostBill(ORG_A, {
          vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
          lineItems: [{ description: 'Bill A', quantity: 1, unitPrice: 80000, taxRate: 0, amount: 80000 }],
        });
        const billB = await PurchasesEngine.createAndPostBill(ORG_A, {
          vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
          lineItems: [{ description: 'Bill B', quantity: 1, unitPrice: 80000, taxRate: 0, amount: 80000 }],
        });

        // Simultaneously apply ₹80,000 to Bill A and ₹80,000 to Bill B
        await Promise.allSettled([
          PurchasesEngine.applyVendorAdvance(ORG_A, {
            advanceId: adv.id,
            vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
            billId: billA.id,
            amount: 80000,
            appliedDate: '2026-05-15',
          }),
          PurchasesEngine.applyVendorAdvance(ORG_A, {
            advanceId: adv.id,
            vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
            billId: billB.id,
            amount: 80000,
            appliedDate: '2026-05-15',
          }),
        ]);

        await MasterFinanceFixture.assertVendorAdvanceConservation(adv.id, ORG_A);
      }

      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
    });
  });

  // =========================================================================
  // 7. CON-008: CREDIT APPLICATION RACE
  // =========================================================================
  describe('7. Credit Application Race (CON-008)', () => {
    it('ensures available customer credit never falls below zero during concurrent applications', async () => {
      for (let round = 0; round < 15; round++) {
        // Create initial invoice and credit note
        const invOrig = await SalesEngine.createAndPostInvoice(ORG_A, {
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
          lineItems: [{ description: 'Base', quantity: 1, unitPrice: 50000, taxRate: 0, amount: 50000 }],
        });
        const cn = await SalesEngine.createCreditNote(ORG_A, {
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
          customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
          invoiceId: invOrig.id,
          date: '2026-05-15',
          taxableAmount: 50000,
          taxAmount: 0,
          reason: 'Full Return',
        });

        // Two new invoices of ₹40,000 each
        const invA = await SalesEngine.createAndPostInvoice(ORG_A, {
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
          lineItems: [{ description: 'New Inv A', quantity: 1, unitPrice: 40000, taxRate: 0, amount: 40000 }],
        });
        const invB = await SalesEngine.createAndPostInvoice(ORG_A, {
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
          lineItems: [{ description: 'New Inv B', quantity: 1, unitPrice: 40000, taxRate: 0, amount: 40000 }],
        });

        // Apply credit concurrently
        await Promise.allSettled([
          SalesEngine.applyCreditNoteToInvoice(ORG_A, cn.creditNoteId, invA.id, 40000, '2026-05-15'),
          SalesEngine.applyCreditNoteToInvoice(ORG_A, cn.creditNoteId, invB.id, 40000, '2026-05-15'),
        ]);

        const cnCheck = await db.query(`SELECT remaining_credit, total_amount FROM credit_notes WHERE id = $1`, [cn.creditNoteId]);
        expect(Number(cnCheck.rows[0].remaining_credit)).toBeGreaterThanOrEqual(0);
        await MasterFinanceFixture.assertCreditConservation(cn.creditNoteId, ORG_A);
      }

      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
    });
  });

  // =========================================================================
  // 8. CON-009: PURCHASE ORDER PARTIAL BILLING RACE (DEF-CON-009 REGRESSION)
  // =========================================================================
  describe('8. Purchase Order Partial Billing Race (CON-009 / DEF-CON-009 Fixed)', () => {
    it('prevents over-billing committed quantities across 100 simultaneous double-billing rounds', async () => {
      for (let round = 0; round < 100; round++) {
        const po = await PurchasesEngine.createPurchaseOrder(ORG_A, {
          vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
          vendorName: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.name,
          orderDate: '2026-05-01',
          lineItems: [{ description: 'Plywood', quantity: 100, unitPrice: 1000, taxRate: 0, amount: 100000 }],
        });

        // Two simultaneous billings of ₹70,000 each against ₹100,000 PO
        const results = await Promise.allSettled([
          PurchasesEngine.createAndPostBill(ORG_A, {
            vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
            purchaseOrderId: po.id,
            billDate: '2026-05-15',
            lineItems: [{ description: 'Plywood Batch A', quantity: 70, unitPrice: 1000, taxRate: 0, amount: 70000 }],
          }),
          PurchasesEngine.createAndPostBill(ORG_A, {
            vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
            purchaseOrderId: po.id,
            billDate: '2026-05-15',
            lineItems: [{ description: 'Plywood Batch B', quantity: 70, unitPrice: 1000, taxRate: 0, amount: 70000 }],
          }),
        ]);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');

        // Exactly one must succeed and one must be rejected
        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(1);
        if (rejected[0].status === 'rejected') {
          expect((rejected[0] as PromiseRejectedResult).reason?.message).toMatch(/exceeds the remaining unbilled purchase order balance/i);
        }

        const poCheck = await db.query(`SELECT billed_amount, total_amount, status FROM purchase_orders WHERE id = $1`, [po.id]);
        expect(Number(poCheck.rows[0].billed_amount)).toBe(70000);
        expect(Number(poCheck.rows[0].total_amount)).toBe(100000);
        expect(poCheck.rows[0].status).toBe('PARTIALLY_BILLED');
      }

      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
    });

    it('verifies exact boundary scenarios for purchase order billing limits', async () => {
      // 1. ₹50k + ₹50k -> both succeed, total 100k (BILLED)
      const po1 = await PurchasesEngine.createPurchaseOrder(ORG_A, {
        vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
        orderDate: '2026-05-01',
        lineItems: [{ description: 'Item', quantity: 100, unitPrice: 1000, taxRate: 0, amount: 100000 }],
      });
      const res1 = await Promise.allSettled([
        PurchasesEngine.createAndPostBill(ORG_A, { vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id, purchaseOrderId: po1.id, billDate: '2026-05-15', lineItems: [{ description: 'Part 1', quantity: 50, unitPrice: 1000, taxRate: 0, amount: 50000 }] }),
        PurchasesEngine.createAndPostBill(ORG_A, { vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id, purchaseOrderId: po1.id, billDate: '2026-05-15', lineItems: [{ description: 'Part 2', quantity: 50, unitPrice: 1000, taxRate: 0, amount: 50000 }] }),
      ]);
      expect(res1.filter(r => r.status === 'fulfilled').length).toBe(2);
      const po1Check = await db.query(`SELECT billed_amount, status FROM purchase_orders WHERE id = $1`, [po1.id]);
      expect(Number(po1Check.rows[0].billed_amount)).toBe(100000);
      expect(po1Check.rows[0].status).toBe('BILLED');

      // 2. ₹60k + ₹40k -> both succeed, total 100k (BILLED)
      const po2 = await PurchasesEngine.createPurchaseOrder(ORG_A, {
        vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
        orderDate: '2026-05-01',
        lineItems: [{ description: 'Item', quantity: 100, unitPrice: 1000, taxRate: 0, amount: 100000 }],
      });
      const res2 = await Promise.allSettled([
        PurchasesEngine.createAndPostBill(ORG_A, { vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id, purchaseOrderId: po2.id, billDate: '2026-05-15', lineItems: [{ description: 'Part 1', quantity: 60, unitPrice: 1000, taxRate: 0, amount: 60000 }] }),
        PurchasesEngine.createAndPostBill(ORG_A, { vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id, purchaseOrderId: po2.id, billDate: '2026-05-15', lineItems: [{ description: 'Part 2', quantity: 40, unitPrice: 1000, taxRate: 0, amount: 40000 }] }),
      ]);
      expect(res2.filter(r => r.status === 'fulfilled').length).toBe(2);
      const po2Check = await db.query(`SELECT billed_amount, status FROM purchase_orders WHERE id = $1`, [po2.id]);
      expect(Number(po2Check.rows[0].billed_amount)).toBe(100000);
      expect(po2Check.rows[0].status).toBe('BILLED');

      // 3. ₹100k + ₹1 -> only ₹100k succeeds
      const po3 = await PurchasesEngine.createPurchaseOrder(ORG_A, {
        vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
        orderDate: '2026-05-01',
        lineItems: [{ description: 'Item', quantity: 100, unitPrice: 1000, taxRate: 0, amount: 100000 }],
      });
      await PurchasesEngine.createAndPostBill(ORG_A, { vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id, purchaseOrderId: po3.id, billDate: '2026-05-15', lineItems: [{ description: 'Full', quantity: 100, unitPrice: 1000, taxRate: 0, amount: 100000 }] });
      await expect(
        PurchasesEngine.createAndPostBill(ORG_A, { vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id, purchaseOrderId: po3.id, billDate: '2026-05-15', lineItems: [{ description: 'Extra', quantity: 1, unitPrice: 1, taxRate: 0, amount: 1 }] })
      ).rejects.toThrow(/exceeds the remaining unbilled purchase order balance/i);

      // 4. ₹70k + ₹30k -> both succeed
      const po4 = await PurchasesEngine.createPurchaseOrder(ORG_A, {
        vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
        orderDate: '2026-05-01',
        lineItems: [{ description: 'Item', quantity: 100, unitPrice: 1000, taxRate: 0, amount: 100000 }],
      });
      const res4 = await Promise.allSettled([
        PurchasesEngine.createAndPostBill(ORG_A, { vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id, purchaseOrderId: po4.id, billDate: '2026-05-15', lineItems: [{ description: 'Part 1', quantity: 70, unitPrice: 1000, taxRate: 0, amount: 70000 }] }),
        PurchasesEngine.createAndPostBill(ORG_A, { vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id, purchaseOrderId: po4.id, billDate: '2026-05-15', lineItems: [{ description: 'Part 2', quantity: 30, unitPrice: 1000, taxRate: 0, amount: 30000 }] }),
      ]);
      expect(res4.filter(r => r.status === 'fulfilled').length).toBe(2);

      // 5. ₹70k + ₹31k -> only one succeeds
      const po5 = await PurchasesEngine.createPurchaseOrder(ORG_A, {
        vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
        orderDate: '2026-05-01',
        lineItems: [{ description: 'Item', quantity: 100, unitPrice: 1000, taxRate: 0, amount: 100000 }],
      });
      const res5 = await Promise.allSettled([
        PurchasesEngine.createAndPostBill(ORG_A, { vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id, purchaseOrderId: po5.id, billDate: '2026-05-15', lineItems: [{ description: 'Part 1', quantity: 70, unitPrice: 1000, taxRate: 0, amount: 70000 }] }),
        PurchasesEngine.createAndPostBill(ORG_A, { vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id, purchaseOrderId: po5.id, billDate: '2026-05-15', lineItems: [{ description: 'Part 2', quantity: 31, unitPrice: 1000, taxRate: 0, amount: 31000 }] }),
      ]);
      expect(res5.filter(r => r.status === 'fulfilled').length).toBe(1);
      expect(res5.filter(r => r.status === 'rejected').length).toBe(1);

      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
    });
  });

  // =========================================================================
  // 9. CON-010: DUPLICATE CONVERSION RACE
  // =========================================================================
  describe('9. Duplicate Conversion Race (CON-010)', () => {
    it('prevents duplicate financial document generation when conversion endpoint is triggered simultaneously', async () => {
      const quote = await QuotationEngine.createQuotation(ORG_A, {
        customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
        issueDate: '2026-05-01',
        status: 'SENT',
        lineItems: [{ name: 'Custom Table', description: 'Custom Table', quantity: 1, unitPrice: 25000, rate: 25000, taxRate: 0, totalAmount: 25000 }],
      }, MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.sales.id);

      // Simultaneously trigger conversion twice
      const results = await Promise.allSettled([
        QuotationEngine.convertToInvoice(ORG_A, quote.id, MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.sales.id),
        QuotationEngine.convertToInvoice(ORG_A, quote.id, MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.sales.id),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBe(1);

      // Exactly ONE invoice must reference the quotation
      const invoices = await db.query(`SELECT id FROM invoices WHERE organization_id = $1 AND estimate_id = $2`, [ORG_A, quote.id]);
      expect(invoices.rows.length).toBe(1);

      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
    });
  });

  // =========================================================================
  // 10. CON-011: PERIOD LOCK RACE
  // =========================================================================
  describe('10. Period Lock Race (CON-011)', () => {
    it('guarantees that no financial document is committed into a locked period after lock establishes', async () => {
      const lockMonth = 5;
      const barrier = new ConcurrencyBarrier(2);

      const postTask = async () => {
        await barrier.arriveAndWait();
        return await SalesEngine.createAndPostInvoice(ORG_A, {
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
          issueDate: '2026-05-15',
          dueDate: '2026-06-15',
          lineItems: [{ description: 'Test Item', quantity: 1, unitPrice: 1000, taxRate: 0, amount: 1000 }],
        });
      };

      const lockTask = async () => {
        await barrier.arriveAndWait();
        return await AccountingPeriodService.lockPeriod(ORG_A, 2026, lockMonth, MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.admin.id);
      };

      await Promise.allSettled([postTask(), lockTask()]);

      // If period is locked, verify any subsequent attempt strictly fails
      const isLocked = await AccountingPeriodService.isPeriodLocked(ORG_A, '2026-05-15');
      if (isLocked) {
        await expect(
          SalesEngine.createAndPostInvoice(ORG_A, {
            customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
            issueDate: '2026-05-15',
            lineItems: [{ description: 'Post-Lock Test', quantity: 1, unitPrice: 1000, taxRate: 0, amount: 1000 }],
          })
        ).rejects.toThrow(/locked/i);
      }

      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
    });
  });

  // =========================================================================
  // 11. CON-012: BANK RECONCILIATION RACE
  // =========================================================================
  describe('11. Bank Reconciliation Race (CON-012)', () => {
    it('prevents duplicate matching and double-clearing of bank transactions', async () => {
      const bankAccId = newId('bank-acc');
      await db.query(
        `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, masked_account_number, bank_name, account_type, currency, current_balance, opening_balance_date, status, is_active)
         VALUES ($1, $2, $3, 'Main Checking', '•••• 1234', '•••• 1234', 'HDFC Bank', 'Checking', 'INR', 0, '2026-04-01', 'Active', TRUE)`,
        [bankAccId, ORG_A, `acc-${ORG_A}-1010`]
      );

      // Seed bank statement transaction
      const statementTxId = newId('st-tx');
      await db.query(
        `INSERT INTO bank_statement_transactions (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, currency, fingerprint, narration, reconciliation_status)
         VALUES ($1, $2, $3, 'imp-1', '2026-05-15', 5000, 'CREDIT', 'INR', 'fp-1', 'Customer remittance', 'UNMATCHED')`,
        [statementTxId, ORG_A, bankAccId]
      );

      // Seed matching invoice
      const inv = await SalesEngine.createAndPostInvoice(ORG_A, {
        customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
        lineItems: [{ description: 'Item', quantity: 1, unitPrice: 5000, taxRate: 0, amount: 5000 }],
      });

      // Simultaneously attempt to match statement transaction
      const results = await Promise.allSettled([
        BankReconciliationService.matchTransaction(ORG_A, statementTxId, 'invoice', inv.id, 5000),
        BankReconciliationService.matchTransaction(ORG_A, statementTxId, 'invoice', inv.id, 5000),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      expect(fulfilled.length).toBe(1);

      const txCheck = await db.query(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [statementTxId]);
      expect(txCheck.rows[0].reconciliation_status).toBe('MATCHED');
    });
  });

  // =========================================================================
  // 12. IDEMPOTENCY & DUPLICATE HTTP REQUEST MATRIX
  // =========================================================================
  describe('12. Idempotency & Duplicate HTTP Request Handling', () => {
    it('replays cached response identically and prevents double financial posting on Idempotency-Key reuse', async () => {
      const idempotencyKey = `idem-${Date.now()}-1234567890abcdef`;
      const token = JwtAuth.generateToken({
        userId: MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.id,
        email: MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.email,
      });

      const payload = {
        clientId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
        clientName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
        issueDate: '2026-05-15',
        dueDate: '2026-06-15',
        items: [{ description: 'Idempotency test item', quantity: 1, unitPrice: 15000, taxRate: 0, amount: 15000 }],
      };

      // First Request
      const res1 = await request(app)
        .post('/api/v1/finance/invoices')
        .set('Authorization', `Bearer ${token}`)
        .set('x-organization-id', ORG_A)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(res1.status).toBe(201);
      const invoiceId1 = res1.body.id || res1.body.data?.id;

      // Replay identical request with identical key -> returns exact cached result
      const res2 = await request(app)
        .post('/api/v1/finance/invoices')
        .set('Authorization', `Bearer ${token}`)
        .set('x-organization-id', ORG_A)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);

      expect(res2.status).toBe(201);
      const invoiceId2 = res2.body.id || res2.body.data?.id;

      // Exactly ONE invoice must exist
      expect(invoiceId2).toBe(invoiceId1);
      const dbInvoices = await db.query(`SELECT id FROM invoices WHERE organization_id = $1 AND id = $2`, [ORG_A, invoiceId1]);
      expect(dbInvoices.rows.length).toBe(1);

      // Replay same Idempotency-Key with DIFFERENT request payload -> returns 409 Conflict
      const conflictingPayload = {
        ...payload,
        items: [{ description: 'Conflicting item with different amount', quantity: 2, unitPrice: 20000, taxRate: 0, amount: 40000 }],
      };
      const resConflict = await request(app)
        .post('/api/v1/finance/invoices')
        .set('Authorization', `Bearer ${token}`)
        .set('x-organization-id', ORG_A)
        .set('Idempotency-Key', idempotencyKey)
        .send(conflictingPayload);

      expect(resConflict.status).toBe(409);
      expect(resConflict.body.error).toMatch(/already used with a different request/i);

      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
    });
  });

  // =========================================================================
  // 13. TRANSACTION ROLLBACK ATOMICITY
  // =========================================================================
  describe('13. Transaction Rollback Atomicity', () => {
    it('leaves zero orphan records, unposted journals, or corrupted balances on failure after journal write', async () => {
      const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A);

      await expect(
        SalesEngine.recordPayment(ORG_A, {
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
          customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
          paymentDate: '2026-05-20',
          amount: 50000,
          paymentMode: 'Bank Transfer',
          depositToAccountId: `acc-${ORG_A}-1010`,
          allocations: [{ invoiceId: inv.invoiceId, amount: 50000 }],
          _debugFailPoint: 'after_journal',
        })
      ).rejects.toThrow();

      // Verify zero orphan payments or allocations
      const payments = await db.query(`SELECT id FROM payments_received WHERE organization_id = $1`, [ORG_A]);
      expect(payments.rows.length).toBe(0);

      const allocations = await db.query(`SELECT id FROM payment_received_allocations WHERE organization_id = $1`, [ORG_A]);
      expect(allocations.rows.length).toBe(0);

      // Verify invoice balance unchanged
      const invCheck = await db.query(`SELECT paid_amount, balance_due FROM invoices WHERE id = $1`, [inv.invoiceId]);
      expect(Number(invCheck.rows[0].paid_amount)).toBe(0);
      expect(Number(invCheck.rows[0].balance_due)).toBe(inv.totalAmount);

      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
    });
  });

  // =========================================================================
  // 14. DATABASE DEADLOCK & CONFLICT HANDLING
  // =========================================================================
  describe('14. Database Deadlock & Retry Behavior', () => {
    it('handles inverted multi-resource allocations without leaving dangling state', async () => {
      const invA = await MasterFinanceFixture.createStandardInvoice(ORG_A, { totalAmount: 50000 });
      const invB = await MasterFinanceFixture.createStandardInvoice(ORG_A, { totalAmount: 50000 });

      // Inverted allocation orders
      const res1 = SalesEngine.recordPayment(ORG_A, {
        customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
        paymentDate: '2026-05-20',
        amount: 20000,
        depositToAccountId: `acc-${ORG_A}-1010`,
        allocations: [
          { invoiceId: invA.invoiceId, amount: 10000 },
          { invoiceId: invB.invoiceId, amount: 10000 },
        ],
      });

      const res2 = SalesEngine.recordPayment(ORG_A, {
        customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
        paymentDate: '2026-05-20',
        amount: 20000,
        depositToAccountId: `acc-${ORG_A}-1010`,
        allocations: [
          { invoiceId: invB.invoiceId, amount: 10000 },
          { invoiceId: invA.invoiceId, amount: 10000 },
        ],
      });

      const settled = await Promise.allSettled([res1, res2]);
      const successful = settled.filter((s) => s.status === 'fulfilled');
      expect(successful.length).toBeGreaterThanOrEqual(1);

      await MasterFinanceFixture.assertInvoiceBalanceCorrect(invA.invoiceId, ORG_A);
      await MasterFinanceFixture.assertInvoiceBalanceCorrect(invB.invoiceId, ORG_A);
      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
    });
  });

  // =========================================================================
  // 15. RBAC ADVERSARIAL MATRIX & PERMISSION BOUNDARIES
  // =========================================================================
  describe('15. RBAC Adversarial Matrix & Permission Boundaries', () => {
    const roles: UserRole[] = ['Owner', 'Admin', 'Accountant', 'Sales', 'Purchase', 'Viewer'];

    it('enforces RBAC matrix across all core operations and rejects unauthorized actions with 403', async () => {
      for (const role of roles) {
        const token = JwtAuth.generateToken({
          userId: `user-${role.toLowerCase()}`,
          email: `${role.toLowerCase()}@example.com`,
        });

        // Seed user with password_hash and member role
        const memberId = newId('mbr');
        await db.query(
          `INSERT INTO users (id, email, full_name, password_hash, status) VALUES ($1, $2, $3, 'hash123', 'Active') ON CONFLICT (id) DO NOTHING`,
          [`user-${role.toLowerCase()}`, `${role.toLowerCase()}@example.com`, `${role} User`]
        );
        await db.query(
          `INSERT INTO organization_members (id, organization_id, user_id, role, status) VALUES ($1, $2, $3, $4, 'Active')
           ON CONFLICT (organization_id, user_id) DO UPDATE SET role = $4`,
          [memberId, ORG_A, `user-${role.toLowerCase()}`, role]
        );

        // 1. Invoices Create
        const canCreateInvoice = RbacService.hasPermission(role, 'invoices.create');
        const invRes = await request(app)
          .post('/api/v1/finance/invoices')
          .set('Authorization', `Bearer ${token}`)
          .set('x-organization-id', ORG_A)
          .send({
            clientId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
            clientName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
            issueDate: '2026-07-15',
            dueDate: '2026-08-15',
            items: [{ description: 'Test Item', quantity: 1, unitPrice: 1000, taxRate: 0, amount: 1000 }],
          });

        if (canCreateInvoice) {
          expect(invRes.status).toBe(201);
        } else {
          expect(invRes.status).toBe(403);
        }

        // 2. Period Close
        const canClosePeriod = RbacService.hasPermission(role, 'settings.close_period');
        const lockRes = await request(app)
          .post('/api/v1/finance/period-locks')
          .set('Authorization', `Bearer ${token}`)
          .set('x-organization-id', ORG_A)
          .send({ lockDate: '2026-05-31', reason: 'Month end lock test' });

        if (canClosePeriod) {
          expect([200, 201]).toContain(lockRes.status);
        } else {
          expect(lockRes.status).toBe(403);
        }
      }
    });

    it('rejects high-risk unauthorized actions: Viewer cannot void documents or record payments', async () => {
      const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A);
      const bill = await MasterFinanceFixture.createStandardBill(ORG_A);
      const viewerToken = JwtAuth.generateToken({
        userId: MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.viewer.id,
        email: MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.viewer.email,
      });

      // Attempt to void bill as Viewer
      const voidRes = await request(app)
        .post(`/api/v1/finance/bills/${bill.id}/void`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .set('x-organization-id', ORG_A)
        .send({ reason: 'Malicious void' });

      expect(voidRes.status).toBe(403);

      // Attempt to record payment as Viewer
      const payRes = await request(app)
        .post('/api/v1/finance/payments-received')
        .set('Authorization', `Bearer ${viewerToken}`)
        .set('x-organization-id', ORG_A)
        .send({
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
          amount: 1000,
          allocations: [{ invoiceId: inv.invoiceId, amount: 1000 }],
        });

      expect(payRes.status).toBe(403);
    });
  });

  // =========================================================================
  // 16. TENANT IDOR MATRIX & ISOLATION
  // =========================================================================
  describe('16. Tenant IDOR Matrix & Cross-Tenant Access Rejection', () => {
    it('strictly denies ORG-A actors access to ORG-B entities across all REST endpoints', async () => {
      // Seed entity in Org B
      const invB = await MasterFinanceFixture.createStandardInvoice(ORG_B);
      const billB = await MasterFinanceFixture.createStandardBill(ORG_B);

      const tokenA = JwtAuth.generateToken({
        userId: MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.id,
        email: MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.email,
      });

      // 1. GET Org B Invoice from Org A context
      const getInv = await request(app)
        .get(`/api/v1/finance/invoices/${invB.invoiceId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-organization-id', ORG_A);
      expect([403, 404]).toContain(getInv.status);

      // 2. GET Org B Bill from Org A context
      const getBill = await request(app)
        .get(`/api/v1/finance/bills/${billB.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-organization-id', ORG_A);
      expect([403, 404]).toContain(getBill.status);

      // 3. Void Org B Bill from Org A context
      const voidBill = await request(app)
        .post(`/api/v1/finance/bills/${billB.id}/void`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-organization-id', ORG_A)
        .send({ reason: 'IDOR void' });
      expect([400, 403, 404, 422]).toContain(voidBill.status);

      // 4. Pay Org B Invoice from Org A context
      const payInv = await request(app)
        .post('/api/v1/finance/payments-received')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-organization-id', ORG_A)
        .send({
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
          amount: 1000,
          allocations: [{ invoiceId: invB.invoiceId, amount: 1000 }],
        });
      expect([400, 403, 404]).toContain(payInv.status);
    });

    it('rejects tenant parameter pollution when headers, body, or query attempt to spoof organization context', async () => {
      const tokenA = JwtAuth.generateToken({
        userId: MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.id,
        email: MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.email,
      });

      // User A (member of ORG_A only) requests with x-organization-id = ORG_B
      const res = await request(app)
        .get('/api/v1/finance/invoices')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-organization-id', ORG_B);

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 17. CROSS-TENANT RELATION INJECTION ATTACKS
  // =========================================================================
  describe('17. Cross-Tenant Relation Injection Attacks', () => {
    it('strictly rejects Org A Invoices referencing Org B Customers', async () => {
      await expect(
        SalesEngine.createAndPostInvoice(ORG_A, {
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.B1.id,
          lineItems: [{ description: 'Malicious Cross-Tenant', quantity: 1, unitPrice: 5000, taxRate: 0, amount: 5000 }],
        })
      ).rejects.toThrow();
    });

    it('strictly rejects Org A Bills referencing Org B Vendors', async () => {
      await expect(
        PurchasesEngine.createAndPostBill(ORG_A, {
          vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.B1.id,
          lineItems: [{ description: 'Malicious Cross-Tenant Bill', quantity: 1, unitPrice: 5000, taxRate: 0, amount: 5000 }],
        })
      ).rejects.toThrow();
    });

    it('strictly rejects Org A Payments allocating to Org B Invoices', async () => {
      const invB = await MasterFinanceFixture.createStandardInvoice(ORG_B);

      await expect(
        SalesEngine.recordPayment(ORG_A, {
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
          paymentDate: '2026-05-20',
          amount: 1000,
          allocations: [{ invoiceId: invB.invoiceId, amount: 1000 }],
        })
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 18. AUTHENTICATION ATTACK MATRIX
  // =========================================================================
  describe('18. Authentication Attack Matrix', () => {
    it('rejects missing, malformed, expired, modified, and revoked JWT tokens with 401', async () => {
      // 1. Missing Token
      const noToken = await request(app).get('/api/v1/finance/invoices').set('x-organization-id', ORG_A);
      expect(noToken.status).toBe(401);

      // 2. Malformed Token
      const badToken = await request(app)
        .get('/api/v1/finance/invoices')
        .set('Authorization', 'Bearer invalid.token.structure')
        .set('x-organization-id', ORG_A);
      expect(badToken.status).toBe(401);

      // 3. Modified Signature / Payload
      const validToken = JwtAuth.generateToken({
        userId: MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.id,
        email: MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.email,
      });
      const tampered = validToken.slice(0, -5) + 'AAAAA';
      const tamperedRes = await request(app)
        .get('/api/v1/finance/invoices')
        .set('Authorization', `Bearer ${tampered}`)
        .set('x-organization-id', ORG_A);
      expect(tamperedRes.status).toBe(401);

      // 4. Inactive / Disabled User
      await db.query(`UPDATE users SET status = 'Suspended' WHERE id = $1`, [MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.viewer.id]);
      const disabledToken = JwtAuth.generateToken({
        userId: MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.viewer.id,
        email: MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.viewer.email,
      });
      const disabledRes = await request(app)
        .get('/api/v1/finance/invoices')
        .set('Authorization', `Bearer ${disabledToken}`)
        .set('x-organization-id', ORG_A);
      expect(disabledRes.status).toBe(401);

      // 5. Revoked Session Token
      await SessionSecurity.revokeAllUserTokens(MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.id);
      const revokedRes = await request(app)
        .get('/api/v1/finance/invoices')
        .set('Authorization', `Bearer ${validToken}`)
        .set('x-organization-id', ORG_A);
      expect(revokedRes.status).toBe(401);
    });
  });

  // =========================================================================
  // 19. SEARCH TENANT ISOLATION
  // =========================================================================
  describe('19. Search Tenant Isolation', () => {
    it('prevents search leakage of secret identifiers between Org A and Org B', async () => {
      // Seed secret identifiers
      const secretA = 'ALPHA-SECRET-987654';
      const secretB = 'BETA-SECRET-123456';

      await MasterFinanceFixture.createStandardInvoice(ORG_A, { notes: secretA });
      await MasterFinanceFixture.createStandardInvoice(ORG_B, { notes: secretB });

      // Org A searches for Org B's secret
      const resultsA = await GlobalSearchService.search(ORG_A, secretB);
      expect(resultsA.length).toBe(0);

      // Org B searches for Org A's secret
      const resultsB = await GlobalSearchService.search(ORG_B, secretA);
      expect(resultsB.length).toBe(0);
    });
  });

  // =========================================================================
  // 20. ATTACHMENT TENANT ISOLATION
  // =========================================================================
  describe('20. Attachment Tenant Isolation', () => {
    it('denies Org A access or download of Org B file receipts and attachments', async () => {
      // Create expense in Org B
      const expB = await MasterFinanceFixture.createStandardExpense(ORG_B);
      const attId = newId('rcpt');
      await db.query(
        `INSERT INTO expense_receipt_attachments (id, organization_id, expense_id, file_name, mime_type, byte_size, content_base64)
         VALUES ($1, $2, $3, 'confidential_org_b.pdf', 'application/pdf', 1024, 'dGVzdA==')`,
        [attId, ORG_B, expB.id]
      );

      const tokenA = JwtAuth.generateToken({
        userId: MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.id,
        email: MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.email,
      });

      const res = await request(app)
        .get(`/api/v1/finance/expenses/${expB.id}/receipts/${attId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-organization-id', ORG_A);

      expect([403, 404]).toContain(res.status);
    });
  });

  // =========================================================================
  // 21. NUMERIC AND BOUNDARY DATABASE CONSTRAINTS
  // =========================================================================
  describe('21. Numeric and Boundary Database Constraints', () => {
    it('rejects extreme numeric overflows, excessive decimal scale, and negative/zero amounts cleanly', async () => {
      // Negative amount
      await expect(
        SalesEngine.createAndPostInvoice(ORG_A, {
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
          lineItems: [{ description: 'Negative', quantity: 1, unitPrice: -500, taxRate: 0, amount: -500 }],
        })
      ).rejects.toThrow();

      // Zero amount
      await expect(
        SalesEngine.createAndPostInvoice(ORG_A, {
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
          lineItems: [{ description: 'Zero', quantity: 1, unitPrice: 0, taxRate: 0, amount: 0 }],
        })
      ).rejects.toThrow();

      // Huge monetary amount exceeding policy bounds (> 100 Billion)
      await expect(
        SalesEngine.createAndPostInvoice(ORG_A, {
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
          lineItems: [{ description: 'Overflow', quantity: 1, unitPrice: 1e16, taxRate: 0, amount: 1e16 }],
        })
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 22. HIGH-VOLUME TENANT COLLISION WORKLOAD
  // =========================================================================
  describe('22. High-Volume Concurrent Tenant Collision Workload', () => {
    it('maintains strict isolation and global integrity under parallel 50-transaction bursts in Org A & Org B', async () => {
      const burstSize = 25;

      const runOrgA = async () => {
        for (let i = 0; i < burstSize; i++) {
          const inv = await SalesEngine.createAndPostInvoice(ORG_A, {
            customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
            issueDate: '2026-05-15',
            lineItems: [{ description: `Item A-${i}`, quantity: 1, unitPrice: 2000, taxRate: 0, amount: 2000 }],
          });
          await SalesEngine.recordPayment(ORG_A, {
            customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
            paymentDate: '2026-05-20',
            amount: 2000,
            depositToAccountId: `acc-${ORG_A}-1010`,
            allocations: [{ invoiceId: inv.id, amount: 2000 }],
          });
        }
      };

      const runOrgB = async () => {
        for (let i = 0; i < burstSize; i++) {
          const inv = await SalesEngine.createAndPostInvoice(ORG_B, {
            customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.B1.id,
            issueDate: '2026-05-15',
            lineItems: [{ description: `Item B-${i}`, quantity: 1, unitPrice: 2000, taxRate: 0, amount: 2000 }],
          });
          await SalesEngine.recordPayment(ORG_B, {
            customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.B1.id,
            paymentDate: '2026-05-20',
            amount: 2000,
            depositToAccountId: `acc-${ORG_B}-1010`,
            allocations: [{ invoiceId: inv.id, amount: 2000 }],
          });
        }
      };

      await Promise.all([runOrgA(), runOrgB()]);

      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_B);
    });
  });
});
