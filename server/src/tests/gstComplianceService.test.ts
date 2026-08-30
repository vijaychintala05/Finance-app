import { beforeAll, describe, expect, it } from 'vitest';
process.env.USE_PG_MEM = 'true';

import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { GSTComplianceService } from '../services/GSTComplianceService';

const ORG_ID = 'org-gst-test-1';
const USER_ID = 'usr-gst-1';

describe('GST Compliance Service & Tax Return Summary Test Suite', () => {
  beforeAll(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    // Create test organization
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, $4, 'GST Tech Solutions', 'India', 'INR', '₹', $5)`,
      [ORG_ID, 'uuid-gst-1', 'PUB-GST-1', 'GSTTECH', USER_ID]
    );

    // Create clients (one with taxId/GSTIN, one without)
    await db.query(
      `INSERT INTO clients (id, organization_id, name, currency, tax_id) VALUES
       ('cli-b2b', $1, 'Registered Enterprise Ltd', 'INR', '27AABCU9603R1ZM'),
       ('cli-b2c', $1, 'Individual Consumer', 'INR', NULL)`,
      [ORG_ID]
    );

    // Create posted sales invoices in period 2026-08
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_id, client_name, issue_date, due_date, subtotal, tax_total, total_amount, balance_due, status) VALUES
       ('inv-gst-1', $1, 'INV-2026-001', 'cli-b2b', 'Registered Enterprise Ltd', '2026-08-10', '2026-08-30', 100000, 18000, 118000, 118000, 'Sent'),
       ('inv-gst-2', $1, 'INV-2026-002', 'cli-b2c', 'Individual Consumer', '2026-08-15', '2026-08-30', 50000, 9000, 59000, 59000, 'Sent')`,
      [ORG_ID]
    );

    // Create vendor bills (inward tax) in period 2026-08
    await db.query(
      `INSERT INTO bills (id, organization_id, bill_number, vendor_name, bill_date, due_date, subtotal, tax_total, total_amount, balance_due, status) VALUES
       ('bill-gst-1', $1, 'BILL-2026-001', 'Cloud Hosting Provider', '2026-08-05', '2026-08-25', 20000, 3600, 23600, 23600, 'Unpaid')`,
      [ORG_ID]
    );
  });

  it('1. Computes outward and inward GST taxable values and tax totals for period', async () => {
    const summary = await GSTComplianceService.getReturnSummary(ORG_ID, '2026-08');

    expect(summary.periodKey).toBe('2026-08');
    expect(summary.periodStart).toBe('2026-08-01');
    expect(summary.periodEnd).toBe('2026-08-31');

    // Outward: 100000 + 50000 = 150000 subtotal, 18000 + 9000 = 27000 tax
    expect(summary.outward.documentCount).toBe(2);
    expect(summary.outward.taxableValue).toBe(150000);
    expect(summary.outward.taxAmount).toBe(27000);

    // Inward: 20000 subtotal, 3600 tax
    expect(summary.inward.documentCount).toBe(1);
    expect(summary.inward.taxableValue).toBe(20000);
    expect(summary.inward.taxAmount).toBe(3600);

    // Net tax position = Output Tax (27000) - Input Tax (3600) = 23400
    expect(summary.netTaxPosition).toBe(23400);
  });

  it('2. Detects outward documents missing customer GSTIN', async () => {
    const summary = await GSTComplianceService.getReturnSummary(ORG_ID, '2026-08');
    // cli-b2c is missing tax_id
    expect(summary.outward.missingGstinCount).toBe(1);
    const gstinCheck = summary.readiness.find((r) => r.code === 'CUSTOMER_GSTIN');
    expect(gstinCheck?.passed).toBe(false);
    expect(gstinCheck?.message).toContain('1 outward documents are missing a customer GSTIN');
  });

  it('3. Rejects invalid period format with structured error', async () => {
    await expect(GSTComplianceService.getReturnSummary(ORG_ID, '2026-13')).rejects.toThrow(/GST_PERIOD_INVALID/);
    await expect(GSTComplianceService.getReturnSummary(ORG_ID, 'invalid-date')).rejects.toThrow(/GST_PERIOD_INVALID/);
  });
});
