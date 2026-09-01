import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';
import { newId } from '../utils/ids';

describe('Deterministic Master Finance Fixture & Pre-Harness Hardening Tests', () => {
  beforeEach(async () => {
    await MasterFinanceFixture.setup({ usePgMem: true });
  });

  // =========================================================================
  // PRE-HARNESS HARDENING TESTS: UNIQUE DOCUMENT NUMBERS
  // =========================================================================
  describe('Pre-Harness Hardening: Database Unique Constraints', () => {
    it('enforces organization-scoped uniqueness for credit notes', async () => {
      const orgA = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
      const orgB = MASTER_FIXTURE_CONSTANTS.ORG_B.id;
      const cnNum = 'CN-TEST-001';

      // Insert credit note in Org A
      await db.query(
        `INSERT INTO credit_notes (id, organization_id, credit_note_number, client_id, client_name, date, total_amount, remaining_credit)
         VALUES ($1, $2, $3, 'cust-1', 'Cust 1', '2026-05-01', 1000, 1000)`,
        [newId('cn'), orgA, cnNum]
      );

      // Attempting duplicate in Org A must throw unique constraint error
      await expect(
        db.query(
          `INSERT INTO credit_notes (id, organization_id, credit_note_number, client_id, client_name, date, total_amount, remaining_credit)
           VALUES ($1, $2, $3, 'cust-2', 'Cust 2', '2026-05-01', 2000, 2000)`,
          [newId('cn'), orgA, cnNum]
        )
      ).rejects.toThrow();

      // Same credit note number in Org B must succeed
      const orgBResult = await db.query(
        `INSERT INTO credit_notes (id, organization_id, credit_note_number, client_id, client_name, date, total_amount, remaining_credit)
         VALUES ($1, $2, $3, 'cust-b', 'Cust B', '2026-05-01', 1500, 1500)
         RETURNING id`,
        [newId('cn'), orgB, cnNum]
      );
      expect(orgBResult.rows.length).toBe(1);
    });

    it('enforces organization-scoped uniqueness for vendor credits / debit notes', async () => {
      const orgA = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
      const orgB = MASTER_FIXTURE_CONSTANTS.ORG_B.id;
      const crNum = 'DN-TEST-001';

      await db.query(
        `INSERT INTO vendor_credits (id, organization_id, credit_number, vendor_id, vendor_name, date, total_amount, remaining_credit)
         VALUES ($1, $2, $3, 'vend-1', 'Vend 1', '2026-05-01', 1000, 1000)`,
        [newId('vc'), orgA, crNum]
      );

      // Duplicate in Org A must fail
      await expect(
        db.query(
          `INSERT INTO vendor_credits (id, organization_id, credit_number, vendor_id, vendor_name, date, total_amount, remaining_credit)
           VALUES ($1, $2, $3, 'vend-2', 'Vend 2', '2026-05-01', 2000, 2000)`,
          [newId('vc'), orgA, crNum]
        )
      ).rejects.toThrow();

      // Same number in Org B succeeds
      const orgBRes = await db.query(
        `INSERT INTO vendor_credits (id, organization_id, credit_number, vendor_id, vendor_name, date, total_amount, remaining_credit)
         VALUES ($1, $2, $3, 'vend-b', 'Vend B', '2026-05-01', 1500, 1500)
         RETURNING id`,
        [newId('vc'), orgB, crNum]
      );
      expect(orgBRes.rows.length).toBe(1);
    });

    it('enforces organization-scoped uniqueness for sales orders', async () => {
      const orgA = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
      const orgB = MASTER_FIXTURE_CONSTANTS.ORG_B.id;
      const soNum = 'SO-TEST-001';

      await db.query(
        `INSERT INTO sales_orders (id, organization_id, sales_order_number, customer_id, customer_name, order_date, total_amount)
         VALUES ($1, $2, $3, 'cust-1', 'Cust 1', '2026-05-01', 5000)`,
        [newId('so'), orgA, soNum]
      );

      // Duplicate in Org A must fail
      await expect(
        db.query(
          `INSERT INTO sales_orders (id, organization_id, sales_order_number, customer_id, customer_name, order_date, total_amount)
           VALUES ($1, $2, $3, 'cust-2', 'Cust 2', '2026-05-01', 6000)`,
          [newId('so'), orgA, soNum]
        )
      ).rejects.toThrow();

      // Same number in Org B succeeds
      const orgBRes = await db.query(
        `INSERT INTO sales_orders (id, organization_id, sales_order_number, customer_id, customer_name, order_date, total_amount)
         VALUES ($1, $2, $3, 'cust-b', 'Cust B', '2026-05-01', 7000)
         RETURNING id`,
        [newId('so'), orgB, soNum]
      );
      expect(orgBRes.rows.length).toBe(1);
    });

    it('enforces organization-scoped uniqueness for purchase orders', async () => {
      const orgA = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
      const orgB = MASTER_FIXTURE_CONSTANTS.ORG_B.id;
      const poNum = 'PO-TEST-001';

      await db.query(
        `INSERT INTO purchase_orders (id, organization_id, purchase_order_number, vendor_id, vendor_name, order_date, total_amount)
         VALUES ($1, $2, $3, 'vend-1', 'Vend 1', '2026-05-01', 5000)`,
        [newId('po'), orgA, poNum]
      );

      // Duplicate in Org A must fail
      await expect(
        db.query(
          `INSERT INTO purchase_orders (id, organization_id, purchase_order_number, vendor_id, vendor_name, order_date, total_amount)
           VALUES ($1, $2, $3, 'vend-2', 'Vend 2', '2026-05-01', 6000)`,
          [newId('po'), orgA, poNum]
        )
      ).rejects.toThrow();

      // Same number in Org B succeeds
      const orgBRes = await db.query(
        `INSERT INTO purchase_orders (id, organization_id, purchase_order_number, vendor_id, vendor_name, order_date, total_amount)
         VALUES ($1, $2, $3, 'vend-b', 'Vend B', '2026-05-01', 7000)
         RETURNING id`,
        [newId('po'), orgB, poNum]
      );
      expect(orgBRes.rows.length).toBe(1);
    });
  });

  // =========================================================================
  // FIXTURE DETERMINISM SCENARIOS (FIXTURE-001 .. FIXTURE-008)
  // =========================================================================
  describe('Fixture Determinism & Integrity Scenarios', () => {
    it('FIXTURE-001: creates identical logical state after multiple setup runs', async () => {
      const accounts1 = await db.query(`SELECT code, name, type FROM accounts WHERE organization_id = $1 ORDER BY code`, [MASTER_FIXTURE_CONSTANTS.ORG_A.id]);
      await MasterFinanceFixture.reset({ usePgMem: true });
      const accounts2 = await db.query(`SELECT code, name, type FROM accounts WHERE organization_id = $1 ORDER BY code`, [MASTER_FIXTURE_CONSTANTS.ORG_A.id]);
      expect(accounts1.rows).toEqual(accounts2.rows);
      expect(accounts1.rows.length).toBe(MASTER_FIXTURE_CONSTANTS.COA.length);
    });

    it('FIXTURE-002: guarantees strict tenant isolation between Org A and Org B', async () => {
      const orgA = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
      const orgB = MASTER_FIXTURE_CONSTANTS.ORG_B.id;

      await MasterFinanceFixture.assertTenantIsolation(orgA, orgB);

      // Verify Org B cannot see Org A customers
      const orgBCusts = await db.query(`SELECT * FROM customers WHERE organization_id = $1 AND id = $2`, [orgB, MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id]);
      expect(orgBCusts.rows.length).toBe(0);

      // Verify Org A cannot see Org B projects
      const orgAProjects = await db.query(`SELECT * FROM projects WHERE organization_id = $1 AND id = $2`, [orgA, MASTER_FIXTURE_CONSTANTS.PROJECTS.ISOLATION.id]);
      expect(orgAProjects.rows.length).toBe(0);
    });

    it('FIXTURE-003: resolves all canonical account IDs to their expected organization', async () => {
      const orgA = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
      for (const item of MASTER_FIXTURE_CONSTANTS.COA) {
        const fullId = `acc-${orgA}-${item.idSuffix}`;
        const res = await db.query(`SELECT * FROM accounts WHERE organization_id = $1 AND id = $2`, [orgA, fullId]);
        expect(res.rows.length).toBe(1);
        expect(res.rows[0].code).toBe(item.code);
        expect(res.rows[0].type).toBe(item.type);
      }
    });

    it('FIXTURE-004: standard transaction builders produce expected deterministic totals and GL postings', async () => {
      const orgA = MASTER_FIXTURE_CONSTANTS.ORG_A.id;

      // 1. Create Standard Invoice
      const invoice = await MasterFinanceFixture.createStandardInvoice(orgA);
      expect(invoice.totalAmount).toBe(118000);
      await MasterFinanceFixture.assertJournalBalanced(invoice.journalEntryId);
      await MasterFinanceFixture.assertInvoiceBalanceCorrect(invoice.invoiceId, orgA);

      // 2. Create Standard Bill
      const bill = await MasterFinanceFixture.createStandardBill(orgA);
      expect(bill.totalAmount).toBe(118000);
      if (bill.journalEntryId) {
        await MasterFinanceFixture.assertJournalBalanced(bill.journalEntryId);
      }
      await MasterFinanceFixture.assertBillBalanceCorrect(bill.id, orgA);

      // 3. Create Standard Expense
      const expense = await MasterFinanceFixture.createStandardExpense(orgA);
      expect(expense.amount).toBe(11800);
      await MasterFinanceFixture.assertJournalBalanced(expense.journalEntryId);

      // 4. Create Standard Credit Note
      const cn = await MasterFinanceFixture.createStandardCreditNote(orgA);
      expect(cn.totalAmount).toBe(11800);

      // 5. Create Standard Vendor Credit
      const vc = await MasterFinanceFixture.createStandardVendorCredit(orgA);
      expect(vc.totalAmount).toBe(11800);
      if (vc.journalEntryId) {
        await MasterFinanceFixture.assertJournalBalanced(vc.journalEntryId);
      }
    });

    it('FIXTURE-005: master fixture begins with a balanced General Ledger', async () => {
      await MasterFinanceFixture.assertGlobalFinancialIntegrity(MASTER_FIXTURE_CONSTANTS.ORG_A.id);
      await MasterFinanceFixture.assertGlobalFinancialIntegrity(MASTER_FIXTURE_CONSTANTS.ORG_B.id);
    });

    it('FIXTURE-006: verifies zero orphan allocation or child records exist', async () => {
      const orphanAllocations = await db.query(
        `SELECT pra.id FROM payment_received_allocations pra
          LEFT JOIN invoices inv ON inv.id = pra.invoice_id
         WHERE inv.id IS NULL`
      );
      expect(orphanAllocations.rows.length).toBe(0);

      const orphanBillAllocations = await db.query(
        `SELECT pma.id FROM payment_made_allocations pma
          LEFT JOIN bills b ON b.id = pma.bill_id
         WHERE b.id IS NULL`
      );
      expect(orphanBillAllocations.rows.length).toBe(0);
    });

    it('FIXTURE-007: resolves all canonical GST items with expected rates and tax metadata', async () => {
      const orgA = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
      for (const item of Object.values(MASTER_FIXTURE_CONSTANTS.ITEMS)) {
        const fullId = `item-${orgA}-${item.code}`;
        const res = await db.query(`SELECT * FROM items WHERE organization_id = $1 AND id = $2`, [orgA, fullId]);
        expect(res.rows.length).toBe(1);
        expect(Number(res.rows[0].gst_rate)).toBe(item.taxRate);
        expect(res.rows[0].sku).toBe(item.code);
      }
    });

    it('FIXTURE-008: reset completely removes mutations made by previous tests', async () => {
      const orgA = MASTER_FIXTURE_CONSTANTS.ORG_A.id;

      // Mutate by adding an invoice and payment
      const inv = await MasterFinanceFixture.createStandardInvoice(orgA);
      await MasterFinanceFixture.createStandardCustomerPayment(orgA, {
        amount: 118000,
        allocations: [{ invoiceId: inv.invoiceId, amount: 118000 }],
      });

      const countBefore = await db.query(`SELECT COUNT(*) AS cnt FROM invoices WHERE organization_id = $1`, [orgA]);
      expect(Number(countBefore.rows[0].cnt)).toBeGreaterThan(0);

      // Reset
      await MasterFinanceFixture.reset({ usePgMem: true });

      const countAfter = await db.query(`SELECT COUNT(*) AS cnt FROM invoices WHERE organization_id = $1`, [orgA]);
      expect(Number(countAfter.rows[0].cnt)).toBe(0);

      await MasterFinanceFixture.assertGlobalFinancialIntegrity(orgA);
    });
  });
});
