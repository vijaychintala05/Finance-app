import { beforeAll, describe, expect, it } from 'vitest';
process.env.USE_PG_MEM = 'true';

import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { CashFlowForecastService } from '../services/CashFlowForecastService';

const ORG_ID = 'org-cff-test-1';
const USER_ID = 'usr-cff-1';

describe('Cash Flow Forecast Service Test Suite', () => {
  beforeAll(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    // Create test organization
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, $4, 'Cash Flow Corp', 'India', 'INR', '₹', $5)`,
      [ORG_ID, 'uuid-cff-1', 'PUB-CFF-1', 'CFFCORP', USER_ID]
    );

    // Create Bank Account in accounts table
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status) VALUES
       ('acc-cff-bank', $1, '1010', 'Primary Checking', 'Asset', 'Bank', 50000, 'Active')`,
      [ORG_ID]
    );

    // Create a posted journal entry giving opening cash balance of 50000
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, status) VALUES
       ('je-cff-init', $1, 'JE-INIT-1', '2026-08-01', 'POSTED')`,
      [ORG_ID]
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, account_code, account_name, debit, credit) VALUES
       ('jl-1', 'je-cff-init', 'acc-cff-bank', '1010', 'Primary Checking', 50000, 0)`,
      []
    );

    // Get today's date formatted as YYYY-MM-DD
    const today = new Date();
    const in10Days = new Date(today.getTime() + 10 * 86400000).toISOString().split('T')[0];
    const in40Days = new Date(today.getTime() + 40 * 86400000).toISOString().split('T')[0];

    // Invoices (inflows):
    // 1. Due in 10 days (Month 1): $30,000
    // 2. Due in 40 days (Month 2): $20,000
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_name, issue_date, due_date, subtotal, total_amount, balance_due, status) VALUES
       ('inv-cff-1', $1, 'INV-CFF-01', 'Client Alpha', $2, $3, 30000, 30000, 30000, 'Sent'),
       ('inv-cff-2', $1, 'INV-CFF-02', 'Client Beta', $2, $4, 20000, 20000, 20000, 'Sent')`,
      [ORG_ID, today.toISOString().split('T')[0], in10Days, in40Days]
    );

    // Bills (outflows):
    // 1. Due in 10 days (Month 1): $15,000
    // 2. Due in 40 days (Month 2): $10,000
    await db.query(
      `INSERT INTO bills (id, organization_id, bill_number, vendor_name, bill_date, due_date, subtotal, total_amount, balance_due, status) VALUES
       ('bill-cff-1', $1, 'BILL-CFF-01', 'Vendor One', $2, $3, 15000, 15000, 15000, 'Unpaid'),
       ('bill-cff-2', $1, 'BILL-CFF-02', 'Vendor Two', $2, $4, 10000, 10000, 10000, 'Unpaid')`,
      [ORG_ID, today.toISOString().split('T')[0], in10Days, in40Days]
    );
  });

  it('1. Fetches accurate cash balance and generates 90-day 3-bucket forecast', async () => {
    const forecast = await CashFlowForecastService.getForecast(ORG_ID, 90);

    expect(forecast.horizonDays).toBe(90);
    expect(forecast.currentBankCashBalance).toBe(50000);
    expect(forecast.periods.length).toBe(3);

    // Period 1 (Days 0-29):
    // Opening: 50,000
    // Expected Inflow: 30,000 (inv-cff-1)
    // Expected Outflow: 15,000 (bill-cff-1)
    // Net Flow: +15,000
    // Closing: 65,000
    const p1 = forecast.periods[0];
    expect(p1.openingBalance).toBe(50000);
    expect(p1.expectedInflows).toBe(30000);
    expect(p1.expectedOutflows).toBe(15000);
    expect(p1.netFlow).toBe(15000);
    expect(p1.closingBalance).toBe(65000);

    // Period 2 (Days 30-59):
    // Opening: 65,000
    // Expected Inflow: 20,000 (inv-cff-2)
    // Expected Outflow: 10,000 (bill-cff-2)
    // Net Flow: +10,000
    // Closing: 75,000
    const p2 = forecast.periods[1];
    expect(p2.openingBalance).toBe(65000);
    expect(p2.expectedInflows).toBe(20000);
    expect(p2.expectedOutflows).toBe(10000);
    expect(p2.netFlow).toBe(10000);
    expect(p2.closingBalance).toBe(75000);

    // Period 3 (Days 60-89):
    // Opening: 75,000
    // Inflow: 0, Outflow: 0
    // Closing: 75,000
    const p3 = forecast.periods[2];
    expect(p3.openingBalance).toBe(75000);
    expect(p3.expectedInflows).toBe(0);
    expect(p3.expectedOutflows).toBe(0);
    expect(p3.closingBalance).toBe(75000);

    expect(forecast.projectedClosingBalance).toBe(75000);
  });

  it('2. Custom horizon (e.g. 30 days) produces single forecast bucket', async () => {
    const forecast = await CashFlowForecastService.getForecast(ORG_ID, 30);
    expect(forecast.horizonDays).toBe(30);
    expect(forecast.periods.length).toBe(1);
    expect(forecast.periods[0].closingBalance).toBe(65000);
  });
});
