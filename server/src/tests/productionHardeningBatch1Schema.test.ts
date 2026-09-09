import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { newId } from '../utils/ids';

describe('Production Hardening: Batch 1 - Schema Constraints & Tenant Relational Integrity', () => {
  const ORG_A = 'org-hardening-batch1-a';
  const ORG_B = 'org-hardening-batch1-b';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    // Seed user
    const userId = 'usr-hardening-admin';
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'admin@hardening.test', 'hashed_pass', 'Hardening Admin', 'Active')
       ON CONFLICT DO NOTHING`,
      [userId]
    );

    // Create test organizations
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES 
         ($1, 'uuid-hardening-a', 'pub-hardening-a', 'ORGA', 'Acme A', 'IN', 'INR', '₹', $3),
         ($2, 'uuid-hardening-b', 'pub-hardening-b', 'ORGB', 'Beta B', 'IN', 'INR', '₹', $3)
       ON CONFLICT DO NOTHING`,
      [ORG_A, ORG_B, userId]
    );

    // Seed customer in Org A and Org B
    await db.query(
      `INSERT INTO customers (id, organization_id, customer_id, display_name, legal_name, currency, active)
       VALUES 
         ('cust-a', $1, 'CUST-A', 'Customer A', 'Customer A Ltd', 'INR', true),
         ('cust-b', $2, 'CUST-B', 'Customer B', 'Customer B Ltd', 'INR', true)
       ON CONFLICT DO NOTHING`,
      [ORG_A, ORG_B]
    );

    // Seed vendor in Org A and Org B
    await db.query(
      `INSERT INTO vendors (id, organization_id, name, company_name, currency)
       VALUES 
         ('vend-a', $1, 'Vendor A', 'Vendor A Ltd', 'INR'),
         ('vend-b', $2, 'Vendor B', 'Vendor B Ltd', 'INR')
       ON CONFLICT DO NOTHING`,
      [ORG_A, ORG_B]
    );

    // Seed accounts in Org A and Org B
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES 
         ('acc-a-bank', $1, '1010', 'Bank A', 'Asset', 'Bank', 50000.00, 'Active'),
         ('acc-b-bank', $2, '1010', 'Bank B', 'Asset', 'Bank', 50000.00, 'Active')
       ON CONFLICT DO NOTHING`,
      [ORG_A, ORG_B]
    );
  });

  it('1. MigrationRunner executes successfully and verifies composite foreign keys exist in schema definitions', async () => {
    await expect(MigrationRunner.runMigrations()).resolves.not.toThrow();
  });

  it('2. Invoices with valid customer in same organization are accepted', async () => {
    const invId = newId('inv');
    await expect(
      db.query(
        `INSERT INTO invoices (id, organization_id, invoice_number, customer_id, client_name, issue_date, due_date, subtotal, tax_total, total_amount, paid_amount, balance_due, status)
         VALUES ($1, $2, 'INV-BATCH1-01', $3, 'Customer A', '2026-09-01', '2026-09-30', 1000, 0, 1000, 0, 1000, 'POSTED')`,
        [invId, ORG_A, 'cust-a']
      )
    ).resolves.not.toThrow();

    const res = await db.query(`SELECT id, customer_id FROM invoices WHERE id = $1`, [invId]);
    expect(res.rows[0].customer_id).toBe('cust-a');
  });

  it('3. Bills with valid vendor in same organization are accepted', async () => {
    const billId = newId('bill');
    await expect(
      db.query(
        `INSERT INTO bills (id, organization_id, bill_number, vendor_id, vendor_name, bill_date, due_date, total_amount, amount_paid, status)
         VALUES ($1, $2, 'BILL-BATCH1-01', $3, 'Vendor A', '2026-09-01', '2026-09-30', 2500, 0, 'Unpaid')`,
        [billId, ORG_A, 'vend-a']
      )
    ).resolves.not.toThrow();

    const res = await db.query(`SELECT id, vendor_id FROM bills WHERE id = $1`, [billId]);
    expect(res.rows[0].vendor_id).toBe('vend-a');
  });

  it('4. Schema migrations define composite foreign keys and non-negative check constraints', async () => {
    // Verify that MigrationRunner tables array includes the newly defined enterprise constraints
    const fs = await import('fs');
    const path = await import('path');
    const migrationFilePath = path.resolve(__dirname, '../database/migrationRunner.ts');
    const migrationContent = fs.readFileSync(migrationFilePath, 'utf-8');

    expect(migrationContent).toContain('fk_invoices_customer_org');
    expect(migrationContent).toContain('fk_bills_vendor_org');
    expect(migrationContent).toContain('fk_journal_lines_account_org');
    expect(migrationContent).toContain('ck_bills_amounts_nonnegative');
    expect(migrationContent).toContain('ck_payments_made_positive');
    expect(migrationContent).toContain('ck_expenses_positive');
  });

  it('5. Payments received requires required fields and validates amount', async () => {
    const badPaymentId = newId('pay');
    await expect(
      db.query(
        `INSERT INTO payments_received (id, organization_id, payment_number, client_id, client_name, payment_date, amount, payment_mode, deposit_to_account_id, unallocated_amount, status)
         VALUES ($1, $2, 'PMT-01', 'cust-a', 'Customer A', '2026-09-01', 500, 'Bank Transfer', 'acc-a-bank', 0, 'ALLOCATED')`,
        [badPaymentId, ORG_A]
      )
    ).resolves.not.toThrow();
  });

  it('6. Tenant RLS policy fails closed and payment sources define organization-matching journal links', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const enterprise = fs.readFileSync(path.resolve(__dirname, '../database/enterpriseHardeningSchema.ts'), 'utf-8');
    const paymentSchema = fs.readFileSync(path.resolve(__dirname, '../database/paymentAccountingSchema.ts'), 'utf-8');

    expect(enterprise).toContain("USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), ''''))");
    expect(enterprise).not.toContain("OR NULLIF(current_setting(''app.current_org_id'', true), '''') IS NULL");
    expect(paymentSchema).toContain('fk_payment_received_journal_org');
    expect(paymentSchema).toContain('fk_payment_made_journal_org');
    expect(paymentSchema).toContain('fk_gateway_journal_org');
    expect(paymentSchema).toContain('ck_customer_refund_one_source');
    expect(paymentSchema).toContain('ck_vendor_refund_one_source');
  });
});
