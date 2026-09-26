import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { JwtAuth } from '../auth/jwt';
import { MasterFinanceFixture } from './fixtures/masterFinanceFixture';
import { OrganizationProvisioningService } from '../services/OrganizationProvisioningService';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { SalesEngine } from '../sales/SalesEngine';
import { RoutePermissionRegistry } from '../auth/RoutePermissionRegistry';

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

  it('registers order mutation replay permissions and retries conversion after transient failure', async () => {
    expect(RoutePermissionRegistry.getRequiredPermissions('POST', '/api/v1/finance/sales-orders/so-permission/convert-inv')).toEqual(['invoices.create', 'sales_orders.create']);
    expect(RoutePermissionRegistry.getRequiredPermissions('POST', '/api/v1/finance/sales-orders/so-permission/fulfill')).toEqual(['delivery_challans.create', 'sales_orders.create', 'invoices.create']);
    expect(RoutePermissionRegistry.getRequiredPermissions('POST', '/api/v1/finance/delivery-challans')).toEqual(['delivery_challans.create', 'invoices.create']);

    const customerId = 'cust-replay-convert-a';
    await db.query(`INSERT INTO customers (id, organization_id, display_name, currency) VALUES ($1, $2, 'Replay Customer', 'INR') ON CONFLICT DO NOTHING`, [customerId, orgA]);
    const order = await SalesEngine.createSalesOrder(orgA, { customerId, orderDate: '2026-09-02', totalAmount: 450, status: 'CONFIRMED', lineItems: [{ description: 'Replay conversion', quantity: 1, unitPrice: 450, taxRate: 0 }] }, undefined, 'usr-admin-a');
    const key = `so-convert-retry-${Date.now()}`;
    vi.spyOn(SalesEngine, 'convertSalesOrderToInvoice').mockRejectedValueOnce(new Error('injected transient database failure'));
    const payload = { partialAmount: 200 };
    const first = await request(app)
      .post(`/api/v1/finance/sales-orders/${order.id}/convert-inv`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', orgA)
      .set('Idempotency-Key', key)
      .send(payload);
    expect(first.status).toBe(500);

    const retry = await request(app)
      .post(`/api/v1/finance/sales-orders/${order.id}/convert-inv`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', orgA)
      .set('Idempotency-Key', key)
      .send(payload);
    expect(retry.status).toBe(201);
    const replay = await request(app)
      .post(`/api/v1/finance/sales-orders/${order.id}/convert-inv`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', orgA)
      .set('Idempotency-Key', key)
      .send(payload);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(retry.body.id);
    const invoiceCount = await db.query(`SELECT COUNT(*)::int AS count FROM invoices WHERE organization_id = $1 AND sales_order_id = $2`, [orgA, order.id]);
    expect(invoiceCount.rows[0].count).toBe(1);

    const taxedOrder = await SalesEngine.createSalesOrder(orgA, { customerId, orderDate: '2026-09-03', totalAmount: 1180, status: 'CONFIRMED', lineItems: [{ description: 'GST replay source', quantity: 1, unitPrice: 1000, taxRate: 18 }] }, undefined, 'usr-admin-a');
    const forgedLines = await request(app)
      .post(`/api/v1/finance/sales-orders/${taxedOrder.id}/convert-inv`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', orgA)
      .set('Idempotency-Key', `so-lines-reject-${Date.now()}`)
      .send({ lineItems: [{ description: 'Forged zero-tax line', quantity: 1, unitPrice: 1180, taxRate: 0 }] });
    expect(forgedLines.status).toBe(422);
    const forgedInvoiceCount = await db.query(`SELECT COUNT(*)::int AS count FROM invoices WHERE organization_id = $1 AND sales_order_id = $2`, [orgA, taxedOrder.id]);
    expect(forgedInvoiceCount.rows[0].count).toBe(0);

    await db.query(`UPDATE organization_members SET role = 'Viewer' WHERE organization_id = $1 AND user_id = $2`, [orgA, 'usr-admin-a']);
    const revokedReplay = await request(app)
      .post(`/api/v1/finance/sales-orders/${order.id}/convert-inv`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', orgA)
      .set('Idempotency-Key', key)
      .send(payload);
    await db.query(`UPDATE organization_members SET role = 'Owner' WHERE organization_id = $1 AND user_id = $2`, [orgA, 'usr-admin-a']);
    expect(revokedReplay.status).toBe(403);
  });
  it('issues linked challans through the audited fulfillment workflow and rejects overage', async () => {
    const customerId = 'cust-linked-challan-a';
    const salesOrderId = 'so-linked-challan-a';
    await db.query(
      `INSERT INTO customers (id, organization_id, display_name, currency) VALUES ($1, $2, 'Linked Challan Customer', 'INR') ON CONFLICT DO NOTHING`,
      [customerId, orgA]
    );
    await db.query(
      `INSERT INTO sales_orders (id, organization_id, sales_order_number, order_date, customer_id, customer_name, total_amount, status, invoiced_amount, fulfilled_amount) VALUES ($1, $2, 'SO-LINKED-CHALLAN-A', '2026-09-01', $3, 'Linked Challan Customer', 500, 'CONFIRMED', 0, 0) ON CONFLICT DO NOTHING`,
      [salesOrderId, orgA, customerId]
    );

    const draftAttempt = await request(app)
      .post('/api/v1/finance/delivery-challans')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', orgA)
      .send({ customerId, salesOrderId, status: 'DRAFT', fulfilledAmount: 200 });
    expect(draftAttempt.status).toBe(400);

    const issued = await request(app)
      .post('/api/v1/finance/delivery-challans')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', orgA)
      .set('Idempotency-Key', 'challan-issued-replay-001')
      .send({ customerId, salesOrderId, status: 'ISSUED', fulfilledAmount: 200, lineItems: [{ description: 'First delivery', quantity: 1, unitPrice: 200 }] });
    expect(issued.status).toBe(201);
    expect(issued.body.status).toBe('ISSUED');
    const replay = await request(app)
      .post('/api/v1/finance/delivery-challans')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', orgA)
      .set('Idempotency-Key', 'challan-issued-replay-001')
      .send({ customerId, salesOrderId, status: 'ISSUED', fulfilledAmount: 200, lineItems: [{ description: 'First delivery', quantity: 1, unitPrice: 200 }] });
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(issued.body.id);
    const order = await db.query(`SELECT status, fulfilled_amount FROM sales_orders WHERE organization_id = $1 AND id = $2`, [orgA, salesOrderId]);
    expect(order.rows[0].status).toBe('PARTIALLY_FULFILLED');
    expect(Number(order.rows[0].fulfilled_amount)).toBe(200);
    const challan = await db.query(`SELECT status, sales_order_id FROM delivery_challans WHERE organization_id = $1 AND id = $2`, [orgA, issued.body.id]);
    expect(challan.rows[0].status).toBe('ISSUED');
    expect(challan.rows[0].sales_order_id).toBe(salesOrderId);

    const excess = await request(app)
      .post('/api/v1/finance/delivery-challans')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('x-organization-id', orgA)
      .send({ customerId, salesOrderId, status: 'ISSUED', fulfilledAmount: 301 });
    expect(excess.status).toBe(409);
    expect(excess.body.error).toMatch(/exceeds the remaining unfulfilled/i);
    const afterExcess = await db.query(`SELECT fulfilled_amount FROM sales_orders WHERE organization_id = $1 AND id = $2`, [orgA, salesOrderId]);
    expect(Number(afterExcess.rows[0].fulfilled_amount)).toBe(200);
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
