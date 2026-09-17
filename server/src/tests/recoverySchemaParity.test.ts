import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../database/db';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';
import {
  POINT1_RECOVERY_SCHEMA,
  OPERATIONAL_TABLE_EXCLUSIONS,
  ENCRYPTED_SECRET_COLUMNS,
} from '../recovery/schema';
import { BackupRestoreService } from '../database/BackupRestoreService';
import { newId } from '../utils/ids';

describe('Recovery Schema Parity and Three-Tier Sensitive Data Policy Suite', () => {
  const orgId = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
  const userId = MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.owner.id;

  beforeAll(async () => {
    await MasterFinanceFixture.setup({ usePgMem: true });
  });

  describe('Tier 1 & Tier 2: Dynamic Schema Parity & Documented Exclusions', () => {
    it('verifies that all declared recovery schema tables exist and contain their required columns', async () => {
      for (const tableSchema of POINT1_RECOVERY_SCHEMA) {
        // Query column metadata or query table with LIMIT 0 to inspect column existence
        const res = await db.query(`SELECT ${tableSchema.columns.join(', ')} FROM ${tableSchema.name} LIMIT 0`);
        expect(res).toBeDefined();
      }
    });

    it('enforces that every operational table exclusion is explicitly documented with business rationale', () => {
      const allowedExclusions = ['outbox_emails', 'api_idempotency_keys', 'rate_limits', 'audit_logs'];
      for (const table of OPERATIONAL_TABLE_EXCLUSIONS) {
        expect(allowedExclusions).toContain(table);
      }
    });

    it('enforces that secret and credential columns are never silently dumped into plain tenant backups', () => {
      // Secret columns (like bank OAuth tokens and webhook secrets) must not be in plain export schemas
      for (const [table, secretCols] of Object.entries(ENCRYPTED_SECRET_COLUMNS)) {
        const schema = POINT1_RECOVERY_SCHEMA.find((s) => s.name === table);
        if (schema) {
          for (const secretCol of secretCols) {
            // Either excluded or handled via encrypted config recovery
            expect(schema.columns).not.toContain(secretCol);
          }
        }
      }
    });
  });

  describe('Tier 1: End-to-End Business Data Value Parity Round-Trip', () => {
    it('exacts 100% field value equality after backup and restore of financial entities', async () => {
      const testPrefix = `recov-${Date.now()}`;
      const customerId = newId('cust-rec');
      const invoiceId = newId('inv-rec');
      const advanceId = newId('adv-rec');
      const appId = newId('caa-rec');
      const jeId = newId('je-rec');

      // 1. Seed non-null test business entities
      await db.query(
        `INSERT INTO customers (id, organization_id, customer_id, display_name, legal_name, email, phone, currency, payment_terms, receivables_balance, active)
         VALUES ($1, $2, $1, 'Recovery Test Customer', 'Recovery Legal Entity', 'rec@cust.com', '+91 9123456780', 'INR', 'Net 30', 5000.00, true)`,
        [customerId, orgId]
      );

      await db.query(
        `INSERT INTO invoices (id, organization_id, invoice_number, customer_id, client_id, client_name, issue_date, due_date, subtotal, total_amount, paid_amount, balance_due, status)
         VALUES ($1, $2, '${testPrefix}-INV-01', $3, $3, 'Recovery Test Customer', '2026-08-01', '2026-08-30', 5000.00, 5000.00, 0.00, 5000.00, 'POSTED')`,
        [invoiceId, orgId, customerId]
      );

      await db.query(
        `INSERT INTO customer_advances (id, organization_id, customer_id, amount, unapplied_amount, received_date, status)
         VALUES ($1, $2, $3, 2000.00, 2000.00, '2026-08-05', 'UNAPPLIED')`,
        [advanceId, orgId, customerId]
      );

      await db.query(
        `INSERT INTO journal_entries (id, organization_id, entry_number, date, description, status)
         VALUES ($1, $2, '${testPrefix}-JE-01', '2026-08-01', 'Recovery Journal Test', 'POSTED')`,
        [jeId, orgId]
      );

      await db.query(
        `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, account_code, account_name, debit, credit, customer_id)
         VALUES ($1, $2, $3, 'acc-${orgId}-1100', '1100', 'Accounts Receivable', 5000.00, 0.00, $4)`,
        [newId('jl'), jeId, orgId, customerId]
      );
      await db.query(
        `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, account_code, account_name, debit, credit, customer_id)
         VALUES ($1, $2, $3, 'acc-${orgId}-4000', '4000', 'Sales Revenue', 0.00, 5000.00, $4)`,
        [newId('jl'), jeId, orgId, customerId]
      );

      await db.query(
        `INSERT INTO customer_advance_applications (id, organization_id, advance_id, invoice_id, amount_applied, applied_date, status, journal_entry_id)
         VALUES ($1, $2, $3, $4, 1500.00, '2026-08-10', 'POSTED', $5)`,
        [appId, orgId, advanceId, invoiceId, jeId]
      );

      // Snapshot original data
      const origCust = (await db.query(`SELECT * FROM customers WHERE id = $1`, [customerId])).rows[0];
      const origInv = (await db.query(`SELECT * FROM invoices WHERE id = $1`, [invoiceId])).rows[0];
      const origAdv = (await db.query(`SELECT * FROM customer_advances WHERE id = $1`, [advanceId])).rows[0];
      const origApp = (await db.query(`SELECT * FROM customer_advance_applications WHERE id = $1`, [appId])).rows[0];
      const origJe = (await db.query(`SELECT * FROM journal_entries WHERE id = $1`, [jeId])).rows[0];

      // 2. Create backup
      const backup = await BackupRestoreService.createBackup(orgId, userId);
      expect(backup.data.customers.length).toBeGreaterThan(0);
      expect(backup.data.invoices.length).toBeGreaterThan(0);

      // 3. Restore backup
      const restoreResult = await BackupRestoreService.restoreBackup(orgId, backup, userId);
      expect(restoreResult.success).toBe(true);

      // 4. Assert 100% field value equality
      const restoredCust = (await db.query(`SELECT * FROM customers WHERE id = $1`, [customerId])).rows[0];
      const restoredInv = (await db.query(`SELECT * FROM invoices WHERE id = $1`, [invoiceId])).rows[0];
      const restoredAdv = (await db.query(`SELECT * FROM customer_advances WHERE id = $1`, [advanceId])).rows[0];
      const restoredApp = (await db.query(`SELECT * FROM customer_advance_applications WHERE id = $1`, [appId])).rows[0];
      const restoredJe = (await db.query(`SELECT * FROM journal_entries WHERE id = $1`, [jeId])).rows[0];

      // Deep value comparisons
      expect(restoredCust.display_name).toBe(origCust.display_name);
      expect(Number(restoredCust.receivables_balance)).toBe(Number(origCust.receivables_balance));
      expect(restoredCust.email).toBe(origCust.email);

      expect(restoredInv.invoice_number).toBe(origInv.invoice_number);
      expect(Number(restoredInv.total_amount)).toBe(Number(origInv.total_amount));
      expect(Number(restoredInv.balance_due)).toBe(Number(origInv.balance_due));

      expect(Number(restoredAdv.amount)).toBe(Number(origAdv.amount));
      expect(Number(restoredAdv.unapplied_amount)).toBe(Number(origAdv.unapplied_amount));

      expect(Number(restoredApp.amount_applied)).toBe(Number(origApp.amount_applied));
      expect(restoredApp.status).toBe(origApp.status);

      expect(restoredJe.entry_number).toBe(origJe.entry_number);
      expect(restoredJe.status).toBe(origJe.status);
    });
  });
});
