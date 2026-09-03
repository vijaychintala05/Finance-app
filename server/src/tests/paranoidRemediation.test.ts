import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { JwtAuth } from '../auth/jwt';
import { MasterFinanceFixture } from './fixtures/masterFinanceFixture';
import { OrganizationProvisioningService } from '../services/OrganizationProvisioningService';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { ServerPostingEngine } from '../accounting/postingEngine';

describe('Staff-Engineer Audit Remediation Suite', () => {
  const orgA = 'org-remedy-a';
  const orgB = 'org-remedy-b';
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    await MasterFinanceFixture.setup({ usePgMem: true });
  });

  beforeEach(async () => {
    await OrganizationProvisioningService.provisionDefaultChart(db, orgA);
    await OrganizationProvisioningService.provisionDefaultChart(db, orgB);

    tokenA = JwtAuth.generateToken({ userId: 'usr-admin-a', email: 'admin-a@example.com' });
    tokenB = JwtAuth.generateToken({ userId: 'usr-admin-b', email: 'admin-b@example.com' });

    // Seed test user accounts
    await db.query(`INSERT INTO users (id, email, password_hash, full_name, status) VALUES ($1, $2, 'hash', 'Admin A', 'Active') ON CONFLICT DO NOTHING`, ['usr-admin-a', 'admin-a@example.com']);
    await db.query(`INSERT INTO users (id, email, password_hash, full_name, status) VALUES ($1, $2, 'hash', 'Admin B', 'Active') ON CONFLICT DO NOTHING`, ['usr-admin-b', 'admin-b@example.com']);
    await db.query(`INSERT INTO organization_members (id, organization_id, user_id, role, status) VALUES ('om-a-1', $1, $2, 'Admin', 'Active') ON CONFLICT DO NOTHING`, [orgA, 'usr-admin-a']);
    await db.query(`INSERT INTO organization_members (id, organization_id, user_id, role, status) VALUES ('om-b-1', $1, $2, 'Admin', 'Active') ON CONFLICT DO NOTHING`, [orgB, 'usr-admin-b']);
  });

  it('1. Delivery Challan rejects cross-tenant customerId', async () => {
    // Customer in Tenant B
    const custBId = 'cust-tenant-b-1';
    await db.query(
      `INSERT INTO customers (id, organization_id, display_name, currency) VALUES ($1, $2, 'Tenant B Customer', 'INR') ON CONFLICT DO NOTHING`,
      [custBId, orgB]
    );

    // Tenant A attempts to create delivery challan with Tenant B customerId
    const res = await request(app)
      .post('/api/v1/finance/delivery-challans')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', orgA)
      .send({
        customerId: custBId,
        customerName: 'Tenant B Customer',
        reason: 'Supply on Approval',
        lineItems: [{ description: 'Goods', quantity: 1, rate: 100 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Customer does not belong to this organization');
  });

  it('2. Delivery Challan rejects cross-tenant salesOrderId', async () => {
    const custAId = 'cust-tenant-a-1';
    await db.query(
      `INSERT INTO customers (id, organization_id, display_name, currency) VALUES ($1, $2, 'Tenant A Customer', 'INR') ON CONFLICT DO NOTHING`,
      [custAId, orgA]
    );

    const soBId = 'so-tenant-b-1';
    await db.query(
      `INSERT INTO sales_orders (id, organization_id, sales_order_number, order_date, customer_id, customer_name, total_amount, status) VALUES ($1, $2, 'SO-B-1', '2026-09-01', 'other-cust', 'Customer B', 500, 'APPROVED') ON CONFLICT DO NOTHING`,
      [soBId, orgB]
    );

    // Tenant A attempts to create delivery challan referencing Tenant B sales order
    const res = await request(app)
      .post('/api/v1/finance/delivery-challans')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', orgA)
      .send({
        customerId: custAId,
        customerName: 'Tenant A Customer',
        salesOrderId: soBId,
        reason: 'Supply on Approval',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Sales order does not belong to this organization');
  });

  it('3. Can void an unpaid bill even if vendor balance is reduced by credits/advances', async () => {
    const vendorId = 'vend-remedy-1';
    await db.query(
      `INSERT INTO vendors (id, organization_id, name, currency, payables_balance) VALUES ($1, $2, 'Vendor Prepay', 'INR', 50) ON CONFLICT DO NOTHING`,
      [vendorId, orgA]
    );

    const expAcc = await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '6000'`, [orgA]);
    const apAcc = await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '2000'`, [orgA]);

    const billId = 'bill-remedy-1';
    const posting = await ServerPostingEngine.postEntry({
      organizationId: orgA,
      entryNumber: 'JRN-BILL-remedy-1',
      date: '2026-09-01',
      description: 'Bill posting',
      lines: [
        { accountId: expAcc.rows[0].id, debit: 150, credit: 0 },
        { accountId: apAcc.rows[0].id, debit: 0, credit: 150 },
      ],
    });

    await db.query(
      `INSERT INTO bills (id, organization_id, bill_number, vendor_id, vendor_name, bill_date, due_date, subtotal, tax_total, total_amount, amount_paid, amount_debited, amount_written_off, balance_due, status, journal_entry_id)
       VALUES ($1, $2, 'BILL-REM-1', $3, 'Vendor Prepay', '2026-09-01', '2026-09-30', 150, 0, 150, 0, 0, 0, 150, 'Unpaid', $4)`,
      [billId, orgA, vendorId, posting.entryId]
    );

    // Vendor balance is only 50 (lower than bill total 150 due to an advance).
    // The void should succeed and subtract 150 from payables_balance without throwing.
    const voidResult = await FinancialDestructiveActionsService.voidBill(
      orgA,
      billId,
      'usr-admin-a',
      'Test void with lower vendor balance'
    );

    expect(voidResult.success).toBe(true);
    const updatedBill = await db.query('SELECT status, balance_due FROM bills WHERE id = $1', [billId]);
    expect(updatedBill.rows[0].status).toBe('VOIDED');
    expect(Number(updatedBill.rows[0].balance_due)).toBe(0);

    const updatedVendor = await db.query('SELECT payables_balance FROM vendors WHERE id = $1', [vendorId]);
    expect(Number(updatedVendor.rows[0].payables_balance)).toBe(-100);
  });
});
