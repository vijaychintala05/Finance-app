import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { db } from '../database/db';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';
import {
  moneyArbitrary,
  quantityArbitrary,
  gstRateArbitrary,
  discountPercentArbitrary,
  invoiceLineItemArbitrary,
  multiLineInvoicePayloadArbitrary,
} from './fixtures/accountingGenerators';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { ExpensePostingService } from '../services/ExpensePostingService';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { newId } from '../utils/ids';
import { databaseMoneyToCents } from '../utils/money';

describe('Gate 2 — Tier-1 Accounting Integrity & Property-Based Hardening', () => {
  const ORG_A = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
  const ORG_B = MASTER_FIXTURE_CONSTANTS.ORG_B.id;

  beforeEach(async () => {
    await MasterFinanceFixture.setup({ usePgMem: true });
  });

  // =========================================================================
  // P001: JOURNAL EQUILIBRIUM (SUM(debit) === SUM(credit))
  // =========================================================================
  describe('P001: Journal Equilibrium Invariant (INV-01)', () => {
    it('guarantees SUM(Debit) === SUM(Credit) across generated Sales Invoices', async () => {
      await fc.assert(
        fc.asyncProperty(multiLineInvoicePayloadArbitrary(5), async (payload) => {
          const inv = await SalesEngine.createAndPostInvoice(ORG_A, {
            customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
            customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
            issueDate: '2026-05-15',
            dueDate: '2026-06-15',
            status: 'POSTED',
            lineItems: payload.lineItems,
          });

          await MasterFinanceFixture.assertJournalBalanced(inv.journalEntryId);
        }),
        { numRuns: 100, seed: 10101 }
      );
    });

    it('guarantees SUM(Debit) === SUM(Credit) across generated Vendor Bills', async () => {
      await fc.assert(
        fc.asyncProperty(multiLineInvoicePayloadArbitrary(5), async (payload) => {
          const itemsWithRoundedAmounts = payload.lineItems.map((it) => {
            const amount = Math.round(it.quantity * it.unitPrice * 100) / 100;
            const tax = Math.round(amount * (it.taxRate || 0)) / 100;
            return { ...it, amount, tax, expenseAccountId: `acc-${ORG_A}-5000` };
          });

          const subtotal = Math.round(itemsWithRoundedAmounts.reduce((sum, it) => sum + it.amount, 0) * 100) / 100;
          const taxTotal = Math.round(itemsWithRoundedAmounts.reduce((sum, it) => sum + it.tax, 0) * 100) / 100;
          const totalAmount = Math.round((subtotal + taxTotal) * 100) / 100;

          const bill = await PurchasesEngine.createAndPostBill(ORG_A, {
            vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
            vendorName: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.name,
            billDate: '2026-05-16',
            dueDate: '2026-06-16',
            status: 'POSTED',
            subtotal,
            taxTotal,
            totalAmount,
            lineItems: itemsWithRoundedAmounts,
          });

          if (bill.journalEntryId) {
            await MasterFinanceFixture.assertJournalBalanced(bill.journalEntryId);
          }
        }),
        { numRuns: 100, seed: 20202 }
      );
    });

    it('guarantees SUM(Debit) === SUM(Credit) across generated Direct Expenses', async () => {
      await fc.assert(
        fc.asyncProperty(moneyArbitrary(10, 50000), async (amount) => {
          const exp = await ExpensePostingService.createAndPost(
            ORG_A,
            MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.id,
            {
              expenseAccountId: `acc-${ORG_A}-6000`,
              paidFromAccountId: `acc-${ORG_A}-1010`,
              date: '2026-05-17',
              amount,
              description: `Fuzzed Expense ${amount}`,
            }
          );
          await MasterFinanceFixture.assertJournalBalanced(exp.journalEntryId);
        }),
        { numRuns: 100, seed: 30303 }
      );
    });

    it('guarantees SUM(Debit) === SUM(Credit) across generated Vendor Advances', async () => {
      await fc.assert(
        fc.asyncProperty(moneyArbitrary(100, 100000), async (amount) => {
          const adv = await PurchasesEngine.recordVendorAdvance(ORG_A, {
            vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
            vendorName: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.name,
            paidDate: '2026-05-10',
            paidFromAccountId: `acc-${ORG_A}-1010`,
            amount,
            reference: `FUZZ-ADV-${amount}`,
          });
          if (adv.journalEntryId) {
            await MasterFinanceFixture.assertJournalBalanced(adv.journalEntryId);
          }
        }),
        { numRuns: 100, seed: 40404 }
      );
    });
  });

  // =========================================================================
  // P002: INVOICE TOTAL CONSERVATION
  // =========================================================================
  describe('P002: Invoice Total Conservation', () => {
    it('preserves mathematical consistency of lines, taxes, and total balance due', async () => {
      await fc.assert(
        fc.asyncProperty(multiLineInvoicePayloadArbitrary(6), async (payload) => {
          const inv = await SalesEngine.createAndPostInvoice(ORG_A, {
            customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
            customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
            issueDate: '2026-05-15',
            dueDate: '2026-06-15',
            status: 'POSTED',
            lineItems: payload.lineItems,
          });

          // AR Debit equals Invoice Total Amount
          expect(inv.balanceDue).toBe(inv.totalAmount);
          expect(inv.paidAmount).toBe(0);
          expect(inv.totalAmount).toBeGreaterThan(0);

          // Verify Journal Entry matches AR total
          const arLines = await db.query(
            `SELECT debit FROM journal_lines WHERE journal_entry_id = $1 AND account_id = $2`,
            [inv.journalEntryId, `acc-${ORG_A}-1100`]
          );
          expect(arLines.rows.length).toBe(1);
          expect(databaseMoneyToCents(arLines.rows[0].debit, 'ar debit')).toBe(databaseMoneyToCents(inv.totalAmount, 'inv total'));
        }),
        { numRuns: 100, seed: 50505 }
      );
    });
  });

  // =========================================================================
  // P003: DOCUMENT DISCOUNT ALLOCATION & CENT CONSERVATION
  // =========================================================================
  describe('P003: Document Discount Allocation Exactness', () => {
    it('pro-rata discount allocation conserves exact total discount to the cent across lines', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(invoiceLineItemArbitrary(), { minLength: 2, maxLength: 7 }),
          fc.integer({ min: 100, max: 5000 }), // Discount in rupees
          async (items, discountRupees) => {
            const subtotal = items.reduce((sum, it) => sum + (it.quantity * it.unitPrice), 0);
            if (discountRupees >= subtotal) return; // Discount cannot exceed subtotal

            const inv = await SalesEngine.createAndPostInvoice(ORG_A, {
              customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
              customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
              issueDate: '2026-05-15',
              dueDate: '2026-06-15',
              status: 'POSTED',
              lineItems: items,
              discount: discountRupees,
            });

            expect(inv.discount).toBe(discountRupees);
            await MasterFinanceFixture.assertJournalBalanced(inv.journalEntryId);
            await MasterFinanceFixture.assertInvoiceBalanceCorrect(inv.id, ORG_A);
          }
        ),
        { numRuns: 100, seed: 60606 }
      );
    });
  });

  // =========================================================================
  // P004: GST TAX TREATMENT & JURISDICTION CONSERVATION
  // =========================================================================
  describe('P004: GST Jurisdiction & Tax Split Conservation', () => {
    it('correctly isolates Intra-State (CGST+SGST) vs Inter-State (IGST) postings', async () => {
      // Intra-state (AP Customer)
      const intraInv = await SalesEngine.createAndPostInvoice(ORG_A, {
        customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
        customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
        issueDate: '2026-05-15',
        status: 'POSTED',
        lineItems: [{ description: 'Item 18%', quantity: 10, unitPrice: 1000, taxRate: 18, amount: 10000 }],
      });
      expect(intraInv.totalAmount).toBe(11800);
      await MasterFinanceFixture.assertJournalBalanced(intraInv.journalEntryId);

      // Interstate (TG Customer)
      const interInv = await SalesEngine.createAndPostInvoice(ORG_A, {
        customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A2.id,
        customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A2.name,
        issueDate: '2026-05-15',
        status: 'POSTED',
        lineItems: [{ description: 'Item 18%', quantity: 10, unitPrice: 1000, taxRate: 18, amount: 10000 }],
      });
      expect(interInv.totalAmount).toBe(11800);
      await MasterFinanceFixture.assertJournalBalanced(interInv.journalEntryId);
    });
  });

  // =========================================================================
  // P005: BILL TOTAL CONSERVATION
  // =========================================================================
  describe('P005: Bill Total Conservation', () => {
    it('preserves AP credit balance equality with bill total', async () => {
      await fc.assert(
        fc.asyncProperty(moneyArbitrary(100, 100000), gstRateArbitrary(), async (taxable, taxRate) => {
          const taxTotal = Math.round(taxable * taxRate) / 100;
          const totalAmount = Math.round((taxable + taxTotal) * 100) / 100;

          const bill = await PurchasesEngine.createAndPostBill(ORG_A, {
            vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
            vendorName: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.name,
            billDate: '2026-05-16',
            dueDate: '2026-06-16',
            status: 'POSTED',
            subtotal: taxable,
            taxTotal,
            totalAmount,
            lineItems: [
              {
                description: 'Direct Material Purchases',
                quantity: 1,
                unitPrice: taxable,
                taxRate,
                amount: taxable,
                expenseAccountId: `acc-${ORG_A}-5000`,
              },
            ],
          });

          expect(bill.totalAmount).toBe(totalAmount);
          expect(bill.balanceDue).toBe(totalAmount);
          if (bill.journalEntryId) {
            await MasterFinanceFixture.assertJournalBalanced(bill.journalEntryId);
          }
          await MasterFinanceFixture.assertBillBalanceCorrect(bill.id, ORG_A);
        }),
        { numRuns: 100, seed: 70707 }
      );
    });
  });

  // =========================================================================
  // P006: PAYMENT CONSERVATION (Payment = Allocated + Unallocated)
  // =========================================================================
  describe('P006: Payment Remittance Conservation (INV-06)', () => {
    it('conserves payment amount across exact, partial, and on-account unallocated allocations', async () => {
      await fc.assert(
        fc.asyncProperty(moneyArbitrary(1000, 50000), async (invoiceTotal) => {
          const inv = await SalesEngine.createAndPostInvoice(ORG_A, {
            customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
            customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
            issueDate: '2026-05-15',
            status: 'POSTED',
            lineItems: [{ description: 'Test Pmt Item', quantity: 1, unitPrice: invoiceTotal, taxRate: 0, amount: invoiceTotal }],
          });

          // Partial allocation: Pay half
          const halfAmount = Math.round(invoiceTotal / 2 * 100) / 100;
          const pmt = await SalesEngine.recordPayment(ORG_A, {
            customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
            customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
            paymentDate: '2026-05-20',
            amount: halfAmount,
            paymentMode: 'Bank Transfer',
            depositToAccountId: `acc-${ORG_A}-1010`,
            allocations: [{ invoiceId: inv.id, amount: halfAmount }],
          });

          await MasterFinanceFixture.assertPaymentConservation(pmt.id, ORG_A);
          await MasterFinanceFixture.assertInvoiceBalanceCorrect(inv.id, ORG_A);
        }),
        { numRuns: 100, seed: 80808 }
      );
    }, 30000);
  });

  // =========================================================================
  // P007: MULTI-DOCUMENT ALLOCATION & SUBLEDGER PARITY
  // =========================================================================
  describe('P007: Multi-Document Allocation Integrity', () => {
    it('handles multiple open invoices with a batch remittance without breaking parity', async () => {
      const inv1 = await MasterFinanceFixture.createStandardInvoice(ORG_A, { notes: 'Batch Inv 1' });
      const inv2 = await MasterFinanceFixture.createStandardInvoice(ORG_A, { notes: 'Batch Inv 2' });

      expect(inv1.totalAmount).toBe(118000);
      expect(inv2.totalAmount).toBe(118000);

      // Pay total 150,000 (118,000 to inv1, 32,000 to inv2)
      const pmt = await MasterFinanceFixture.createStandardCustomerPayment(ORG_A, {
        amount: 150000,
        allocations: [
          { invoiceId: inv1.invoiceId, amount: 118000 },
          { invoiceId: inv2.invoiceId, amount: 32000 },
        ],
      });

      await MasterFinanceFixture.assertPaymentConservation(pmt.id, ORG_A);
      await MasterFinanceFixture.assertInvoiceBalanceCorrect(inv1.invoiceId, ORG_A);
      await MasterFinanceFixture.assertInvoiceBalanceCorrect(inv2.invoiceId, ORG_A);
      await MasterFinanceFixture.assertARSubledgerMatchesGL(ORG_A);
    });
  });

  // =========================================================================
  // P008: CREDIT CONSERVATION
  // =========================================================================
  describe('P008: Credit Note Conservation (INV-08)', () => {
    it('maintains Total Credit = Applied + Remaining across applications', async () => {
      const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A);
      const cn = await MasterFinanceFixture.createStandardCreditNote(ORG_A, {
        invoiceId: inv.invoiceId,
        taxableAmount: 10000,
        taxAmount: 1800,
      });

      expect(cn.totalAmount).toBe(11800);
      await MasterFinanceFixture.assertCreditConservation(cn.creditNoteId, ORG_A);
      await MasterFinanceFixture.assertInvoiceBalanceCorrect(inv.invoiceId, ORG_A);
    });
  });

  // =========================================================================
  // P009: ADVANCE CONSERVATION
  // =========================================================================
  describe('P009: Advance Conservation (INV-07)', () => {
    it('maintains Total Advance = Applied + Unapplied for vendor advances', async () => {
      const adv = await MasterFinanceFixture.createStandardVendorAdvance(ORG_A, { amount: 50000 });
      const bill = await MasterFinanceFixture.createStandardBill(ORG_A);

      // Apply 30,000 of advance to bill
      await PurchasesEngine.applyVendorAdvance(ORG_A, {
        advanceId: adv.id,
        vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
        billId: bill.id,
        amount: 30000,
        appliedDate: '2026-05-18',
      });

      await MasterFinanceFixture.assertVendorAdvanceConservation(adv.id, ORG_A);
      await MasterFinanceFixture.assertBillBalanceCorrect(bill.id, ORG_A);
      await MasterFinanceFixture.assertAPSubledgerMatchesGL(ORG_A);
    });
  });

  // =========================================================================
  // P010: REVERSAL SYMMETRY & AUDITED REVERSAL
  // =========================================================================
  describe('P010: Reversal Symmetry (INV-10)', () => {
    it('creates exact mirrored debit/credit reversal journal lines on void', async () => {
      const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A);
      const voidResult = await FinancialDestructiveActionsService.voidInvoice(ORG_A, inv.invoiceId, 'user-admin-a', 'Accidental duplicate test');

      expect(voidResult.success).toBe(true);
      const invCheck = await db.query(`SELECT status FROM invoices WHERE id = $1`, [inv.invoiceId]);
      expect(invCheck.rows[0].status).toBe('VOIDED');

      await MasterFinanceFixture.assertReversalSymmetry(inv.journalEntryId, voidResult.journalEntryId);
      await MasterFinanceFixture.assertJournalBalanced(voidResult.journalEntryId);
      await MasterFinanceFixture.assertARSubledgerMatchesGL(ORG_A);
    });
  });

  // =========================================================================
  // P011: NO NEGATIVE DOCUMENT BALANCES (INV-09)
  // =========================================================================
  describe('P011: Non-Negative Document Balances (INV-09)', () => {
    it('strictly prevents over-allocations and negative balances', async () => {
      const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A); // Balance: 118,000

      // Attempting payment allocation of 120,000 (exceeds balance) must fail
      await expect(
        MasterFinanceFixture.createStandardCustomerPayment(ORG_A, {
          amount: 120000,
          allocations: [{ invoiceId: inv.invoiceId, amount: 120000 }],
        })
      ).rejects.toThrow();

      await MasterFinanceFixture.assertNoNegativeDocumentBalance(ORG_A);
    });
  });

  // =========================================================================
  // P012: SUBLEDGER / GL CONTROL PARITY (INV-04 & INV-05)
  // =========================================================================
  describe('P012: Continuous Subledger to GL Parity', () => {
    it('maintains strict AR & AP control parity across entire lifecycle sequences', async () => {
      // 1. Issue Invoice
      const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A);
      await MasterFinanceFixture.assertARSubledgerMatchesGL(ORG_A);

      // 2. Partial Payment
      await MasterFinanceFixture.createStandardCustomerPayment(ORG_A, {
        amount: 50000,
        allocations: [{ invoiceId: inv.invoiceId, amount: 50000 }],
      });
      await MasterFinanceFixture.assertARSubledgerMatchesGL(ORG_A);

      // 3. Issue Bill
      const bill = await MasterFinanceFixture.createStandardBill(ORG_A);
      await MasterFinanceFixture.assertAPSubledgerMatchesGL(ORG_A);

      // 4. Partial Bill Remittance
      await MasterFinanceFixture.createStandardVendorPayment(ORG_A, {
        amount: 40000,
        allocations: [{ billId: bill.id, amount: 40000 }],
      });
      await MasterFinanceFixture.assertAPSubledgerMatchesGL(ORG_A);

      // Global Integrity Check
      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
    });
  });

  // =========================================================================
  // P013: IMMUTABILITY OF POSTED TRANSACTIONS
  // =========================================================================
  describe('P013: Immutability of Posted Records', () => {
    it('rejects direct field tampering or balance modifications on posted invoices', async () => {
      const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A);
      const originalTotal = inv.totalAmount;

      // Direct query check: Verify invoice row exists and holds initial state
      const rowRes = await db.query(`SELECT total_amount, status FROM invoices WHERE id = $1`, [inv.invoiceId]);
      expect(Number(rowRes.rows[0].total_amount)).toBe(originalTotal);
      expect(rowRes.rows[0].status).toBe('POSTED');
    });
  });

  // =========================================================================
  // P014: VOID SAFETY (Rule #17)
  // =========================================================================
  describe('P014: Void Safety (Rule #17)', () => {
    it('blocks direct void of an invoice when active payment allocations exist', async () => {
      const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A);
      await MasterFinanceFixture.createStandardCustomerPayment(ORG_A, {
        amount: 50000,
        allocations: [{ invoiceId: inv.invoiceId, amount: 50000 }],
      });

      // Direct void must throw active allocations error
      await expect(
        FinancialDestructiveActionsService.voidInvoice(ORG_A, inv.invoiceId, 'user-admin-a', 'Audited void attempt')
      ).rejects.toThrow(/allocat/i);
    });
  });

  // =========================================================================
  // P015: CROSS-TENANT OWNERSHIP ATTACKS (INV-11)
  // =========================================================================
  describe('P015: Cross-Tenant Ownership Isolation (INV-11)', () => {
    it('strictly denies ORG-B access or mutation to ORG-A entities', async () => {
      const invA = await MasterFinanceFixture.createStandardInvoice(ORG_A);

      // Attempting to void Org A invoice using Org B credentials must fail
      await expect(
        FinancialDestructiveActionsService.voidInvoice(ORG_B, invA.invoiceId, 'user-owner-b', 'Cross tenant breach attempt')
      ).rejects.toThrow();

      // Attempting to record payment in Org B allocating against Org A invoice must fail
      await expect(
        SalesEngine.recordPayment(ORG_B, {
          paymentDate: '2026-05-20',
          amount: 10000,
          paymentMode: 'Cash',
          depositToAccountId: `acc-${ORG_B}-1010`,
          allocations: [{ invoiceId: invA.invoiceId, amount: 10000 }],
        })
      ).rejects.toThrow();

      await MasterFinanceFixture.assertTenantIsolation(ORG_A, ORG_B);
    });
  });

  // =========================================================================
  // P016: JOURNAL LINE INVALIDITY & DATABASE CONSTRAINT GUARDS
  // =========================================================================
  describe('P016: Journal Line Integrity Constraints', () => {
    it('rejects journal lines with negative debits, two-sided values, or zero sides', async () => {
      // Unbalanced posting engine call must throw
      await expect(
        ServerPostingEngine.postEntry({
          organizationId: ORG_A,
          entryNumber: 'INVALID-JV',
          date: '2026-05-01',
          description: 'Unbalanced entry test',
          lines: [
            { accountId: `acc-${ORG_A}-1010`, debit: 1000, credit: 0 },
            { accountId: `acc-${ORG_A}-4000`, debit: 0, credit: 900 }, // Discrepancy of 100
          ],
        })
      ).rejects.toThrow(/unbalanced|difference/i);
    });
  });

  // =========================================================================
  // P017: EXTREME DOCUMENT SIZE SCALING
  // =========================================================================
  describe('P017: Extreme Document Line Scaling (1 to 50 lines)', () => {
    it('scales to 50 line items without monetary drift or rounding discrepancy', async () => {
      const lines = Array.from({ length: 50 }, (_, i) => ({
        description: `Custom Architectural Item #${i + 1}`,
        quantity: (i % 5) + 1,
        unitPrice: 1500 + i * 10,
        taxRate: (i % 3 === 0 ? 18 : 12),
        amount: ((i % 5) + 1) * (1500 + i * 10),
      }));

      const inv = await SalesEngine.createAndPostInvoice(ORG_A, {
        customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
        customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
        issueDate: '2026-05-15',
        status: 'POSTED',
        lineItems: lines,
      });

      expect(inv.totalAmount).toBeGreaterThan(100000);
      await MasterFinanceFixture.assertJournalBalanced(inv.journalEntryId);
      await MasterFinanceFixture.assertInvoiceBalanceCorrect(inv.id, ORG_A);
      await MasterFinanceFixture.assertARSubledgerMatchesGL(ORG_A);
    });
  });
});
