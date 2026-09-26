import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { RoutePermissionRegistry } from '../auth/RoutePermissionRegistry';
import { QuotationEngine } from '../sales/QuotationEngine';
import { RbacService } from '../auth/RbacService';
import { newId } from '../utils/ids';

describe('Customer lifecycle API', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let tokenA: string;
  let tokenB: string;
  let orgA: string;
  let orgB: string;
  let ownerUserA: string;
  let customerId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await MigrationRunner.runMigrations();
    const registerA = await request(app).post('/api/v1/auth/register').send({
      email: `customer-lifecycle-a-${suffix}@test.com`, password: 'Password123!', fullName: 'Lifecycle Owner A',
      organizationName: `Customer Lifecycle A ${suffix}`, role: 'Owner',
    });
    expect(registerA.status).toBe(201);
    tokenA = registerA.body.token;
    ownerUserA = registerA.body.user.id;
    orgA = registerA.body.organizationId;

    const registerB = await request(app).post('/api/v1/auth/register').send({
      email: `customer-lifecycle-b-${suffix}@test.com`, password: 'Password123!', fullName: 'Lifecycle Owner B',
      organizationName: `Customer Lifecycle B ${suffix}`, role: 'Owner',
    });
    expect(registerB.status).toBe(201);
    tokenB = registerB.body.token;
    orgB = registerB.body.organizationId;

    const customer = await request(app).post('/api/v1/finance/customers').set(auth(tokenA)).send({
      displayName: `Lifecycle Customer ${suffix}`, email: `customer-${suffix}@example.com`, phone: '555-0100',
      billingAddress: { line1: 'Original Road' }, gstin: '27AAAAA0000A1Z5', notes: 'Lifecycle note',
    });
    expect(customer.status).toBe(201);
    customerId = customer.body.id;
  });

  it('registers mutation permissions for idempotency replay authorization', () => {
    expect(RoutePermissionRegistry.getRequiredPermissions('PATCH', `/api/v1/finance/customers/${customerId}`)).toEqual(['customers.edit']);
    expect(RoutePermissionRegistry.getRequiredPermissions('POST', `/api/v1/finance/customers/${customerId}/archive`)).toEqual(['customers.archive']);
    expect(RoutePermissionRegistry.getRequiredPermissions('PUT', '/api/v1/finance/sales-orders/so-test')).toEqual(['sales_orders.edit', 'invoices.edit']);
    expect(RoutePermissionRegistry.getRequiredPermissions('POST', '/api/v1/finance/sales-orders/so-test/cancel')).toEqual(['sales_orders.delete', 'sales_orders.edit', 'invoices.edit']);
  });

  it('deletes a custom role with an exact idempotent receipt and one audit entry', async () => {
    const role = await RbacService.createCustomRole(orgA, {
      name: 'Lifecycle Delete ' + suffix,
      permissions: ['invoices.view'],
      userId: ownerUserA,
    });
    const key = 'role-delete-' + suffix;
    const endpoint = '/api/v1/security/roles/' + role.id;
    const first = await request(app).delete(endpoint).set({ ...auth(tokenA), 'Idempotency-Key': key });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ id: role.id, deleted: true });

    const replay = await request(app).delete(endpoint).set({ ...auth(tokenA), 'Idempotency-Key': key });
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({ id: role.id, deleted: true });

    const persisted = await db.query('SELECT id FROM roles WHERE organization_id = $1 AND id = $2', [orgA, role.id]);
    const audits = await db.query(
      "SELECT id FROM audit_logs WHERE organization_id = $1 AND entity_type = 'ROLE' AND entity_id = $2 AND action = 'CUSTOM_ROLE_DELETED'",
      [orgA, role.id],
    );
    expect(persisted.rows).toHaveLength(0);
    expect(audits.rows).toHaveLength(1);
    expect(RoutePermissionRegistry.getRequiredPermissions('DELETE', endpoint)).toEqual(['roles.manage', 'settings.manage_users']);
  });
  it('requires audited sales-order cancellation and prevents status or permission bypasses', async () => {
    const routeCustomer = await request(app).post('/api/v1/finance/customers').set(auth(tokenA)).send({
      displayName: 'Sales Order Customer ' + suffix, email: 'sales-order-' + suffix + '@example.com',
    });
    expect(routeCustomer.status).toBe(201);
    const created = await request(app).post('/api/v1/finance/sales-orders').set(auth(tokenA)).send({
      customerId: routeCustomer.body.id, orderDate: '2026-09-23', totalAmount: 100, status: 'CONFIRMED',
      lineItems: [{ description: 'Lifecycle check', quantity: 1, unitPrice: 100, taxRate: 0, amount: 100 }],
    });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const upperCaseBypass = await request(app).put('/api/v1/finance/sales-orders/' + id).set(auth(tokenA)).send({ status: 'CANCELLED' });
    const titleCaseBypass = await request(app).put('/api/v1/finance/sales-orders/' + id).set(auth(tokenA)).send({ status: 'Cancelled' });
    expect(upperCaseBypass.status).toBe(422);
    expect(titleCaseBypass.status).toBe(422);
    expect(upperCaseBypass.body.error).toMatch(/audited cancellation endpoint/i);
    const missingReason = await request(app).post('/api/v1/finance/sales-orders/' + id + '/cancel').set(auth(tokenA)).send({});
    expect(missingReason.status).toBe(400);
    const cancelled = await request(app).post('/api/v1/finance/sales-orders/' + id + '/cancel').set(auth(tokenA)).send({ reason: 'Customer withdrew the order' });
    expect(cancelled.status).toBe(200);
    expect(String(cancelled.body.status).toUpperCase()).toBe('CANCELLED');

    expect(RoutePermissionRegistry.getRequiredPermissions('PUT', '/api/v1/finance/sales-orders/' + id)).toEqual(['sales_orders.edit', 'invoices.edit']);
    expect(RoutePermissionRegistry.getRequiredPermissions('POST', '/api/v1/finance/sales-orders/' + id + '/cancel')).toEqual(['sales_orders.delete', 'sales_orders.edit', 'invoices.edit']);
  });

  it('creates a canonical client from /clients and preserves older projection-only fields during unrelated edits', async () => {
    const created = await request(app).post('/api/v1/finance/clients').set(auth(tokenA)).send({
      name: `Legacy Client ${suffix}`, companyName: `Legacy Legal ${suffix}`, email: `legacy-${suffix}@example.com`,
      billingAddress: '17 Old Road', taxId: `TAX-${suffix}`, notes: 'Compatibility note',
    });
    expect(created.status).toBe(201);
    const id = created.body.id;
    const canonical = await db.query('SELECT billing_address, gstin, notes FROM customers WHERE organization_id = $1 AND id = $2', [orgA, id]);
    expect(canonical.rows[0].billing_address).toBe('17 Old Road');
    expect(canonical.rows[0].gstin).toBe(`TAX-${suffix}`);
    expect(canonical.rows[0].notes).toBe('Compatibility note');

    await db.query('UPDATE customers SET billing_address = $1, gstin = $2, notes = $3 WHERE organization_id = $4 AND id = $5', [JSON.stringify(null), '', '', orgA, id]);
    await db.query('UPDATE clients SET billing_address = $1, tax_id = $2, notes = $3 WHERE organization_id = $4 AND id = $5', ['Retained Old Address', 'Retained Old Tax', 'Retained Old Notes', orgA, id]);
    const beforeReconcileAudit = await db.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE organization_id = $1 AND entity_type = 'Customer' AND entity_id = $2 AND action = 'CUSTOMER_MASTER_RECONCILED'", [orgA, id]);
    const edited = await request(app).patch(`/api/v1/finance/customers/${id}`).set(auth(tokenA)).send({ name: `Legacy Client ${suffix}` });
    expect(edited.status).toBe(200);
    expect(edited.body.changed).toBe(true);
    const projection = await db.query('SELECT billing_address, tax_id, notes FROM clients WHERE organization_id = $1 AND id = $2', [orgA, id]);
    expect(projection.rows[0]).toMatchObject({
      billing_address: 'Retained Old Address', tax_id: 'Retained Old Tax', notes: 'Retained Old Notes',
    });
    const reconciledCustomer = await db.query('SELECT billing_address, gstin, notes FROM customers WHERE organization_id = $1 AND id = $2', [orgA, id]);
    expect(reconciledCustomer.rows[0]).toMatchObject({ billing_address: 'Retained Old Address', gstin: 'Retained Old Tax', notes: '' });
    const afterReconcileAudit = await db.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE organization_id = $1 AND entity_type = 'Customer' AND entity_id = $2 AND action = 'CUSTOMER_MASTER_RECONCILED'", [orgA, id]);
    expect(afterReconcileAudit.rows[0].count).toBe(beforeReconcileAudit.rows[0].count + 1);
    const reconcileEvent = await db.query("SELECT after_state FROM audit_logs WHERE organization_id = $1 AND entity_type = 'Customer' AND entity_id = $2 AND action = 'CUSTOMER_MASTER_RECONCILED' ORDER BY timestamp DESC LIMIT 1", [orgA, id]);
    expect(reconcileEvent.rows[0].after_state.promotedFields).toEqual(['billingAddress', 'gstin']);

    await db.query('DELETE FROM clients WHERE organization_id = $1 AND id = $2', [orgA, id]);
    const beforeRepairAudit = await db.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE organization_id = $1 AND entity_type = 'Customer' AND entity_id = $2 AND action = 'CUSTOMER_PROJECTION_REPAIRED'", [orgA, id]);
    const noOpRepair = await request(app).patch(`/api/v1/finance/customers/${id}`).set(auth(tokenA)).send({ name: `Legacy Client ${suffix}` });
    expect(noOpRepair.status).toBe(200);
    expect(noOpRepair.body.changed).toBe(false);
    const afterRepairAudit = await db.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE organization_id = $1 AND entity_type = 'Customer' AND entity_id = $2 AND action = 'CUSTOMER_PROJECTION_REPAIRED'", [orgA, id]);
    expect(afterRepairAudit.rows[0].count).toBe(beforeRepairAudit.rows[0].count + 1);
  });

  it('updates canonical and compatibility rows transactionally, rejects cross-tenant access, and rechecks replay permission', async () => {
    const crossTenant = await request(app).patch(`/api/v1/finance/customers/${customerId}`).set(auth(tokenB)).send({ displayName: 'Cross tenant' });
    expect(crossTenant.status).toBe(404);

    const key = `customer-edit-${suffix}-0001`;
    const updated = await request(app).patch(`/api/v1/finance/customers/${customerId}`).set(auth(tokenA)).set('Idempotency-Key', key).send({
      displayName: `Updated Customer ${suffix}`, email: `updated-${suffix}@example.com`,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.changed).toBe(true);
    expect(updated.body.id).toBe(customerId);

    const replayed = await request(app).patch(`/api/v1/finance/customers/${customerId}`).set(auth(tokenA)).set('Idempotency-Key', key).send({
      displayName: `Updated Customer ${suffix}`, email: `updated-${suffix}@example.com`,
    });
    expect(replayed.status).toBe(200);
    expect(replayed.body.id).toBe(customerId);

    await db.query(`UPDATE organization_members SET role = 'Viewer' WHERE organization_id = $1 AND user_id = $2`, [orgA, ownerUserA]);
    const deniedReplay = await request(app).patch(`/api/v1/finance/customers/${customerId}`).set(auth(tokenA)).set('Idempotency-Key', key).send({
      displayName: `Updated Customer ${suffix}`, email: `updated-${suffix}@example.com`,
    });
    await db.query(`UPDATE organization_members SET role = 'Owner' WHERE organization_id = $1 AND user_id = $2`, [orgA, ownerUserA]);
    expect(deniedReplay.status).toBe(403);

    const canonical = await db.query('SELECT display_name, email FROM customers WHERE organization_id = $1 AND id = $2', [orgA, customerId]);
    const projection = await db.query('SELECT name, email FROM clients WHERE organization_id = $1 AND id = $2', [orgA, customerId]);
    expect(canonical.rows[0]).toEqual({ display_name: `Updated Customer ${suffix}`, email: `updated-${suffix}@example.com` });
    expect(projection.rows[0]).toEqual({ name: `Updated Customer ${suffix}`, email: `updated-${suffix}@example.com` });
    const customerNotes = await db.query('SELECT notes FROM clients WHERE organization_id = $1 AND id = $2', [orgA, customerId]);
    expect(customerNotes.rows[0].notes).toBe('Lifecycle note');

    await db.query('UPDATE clients SET receivables_balance = 4321 WHERE organization_id = $1 AND id = $2', [orgA, customerId]);
    const auditCount = await db.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE organization_id = $1 AND entity_type = 'Customer' AND entity_id = $2 AND action = 'CUSTOMER_UPDATED'", [orgA, customerId]);
    const noOp = await request(app).patch(`/api/v1/finance/customers/${customerId}`).set(auth(tokenA)).send({
      displayName: `Updated Customer ${suffix}`, email: `updated-${suffix}@example.com`,
    });
    expect(noOp.status).toBe(200);
    expect(noOp.body.changed).toBe(false);
    const auditAfterNoOp = await db.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE organization_id = $1 AND entity_type = 'Customer' AND entity_id = $2 AND action = 'CUSTOMER_UPDATED'", [orgA, customerId]);
    expect(auditAfterNoOp.rows[0].count).toBe(auditCount.rows[0].count);
    const balanceAfterNoOp = await db.query('SELECT receivables_balance FROM clients WHERE organization_id = $1 AND id = $2', [orgA, customerId]);
    expect(Number(balanceAfterNoOp.rows[0].receivables_balance)).toBe(4321);
  });

  it('propagates explicit metadata clears into both canonical and compatibility rows', async () => {
    const cleared = await request(app).patch(`/api/v1/finance/customers/${customerId}`).set(auth(tokenA)).send({
      legalName: '', email: '', phone: '', gstin: '', billingAddress: '', notes: '',
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body.changed).toBe(true);
    const canonical = await db.query('SELECT legal_name, email, phone, gstin, billing_address, notes FROM customers WHERE organization_id = $1 AND id = $2', [orgA, customerId]);
    expect(canonical.rows[0]).toMatchObject({ legal_name: '', email: '', phone: '', gstin: '', billing_address: '', notes: '' });
    const projection = await db.query('SELECT company_name, email, phone, tax_id, billing_address, notes FROM clients WHERE organization_id = $1 AND id = $2', [orgA, customerId]);
    expect(projection.rows[0]).toMatchObject({ company_name: '', email: '', phone: '', tax_id: '', billing_address: '', notes: '' });
  });

  it('archives repeatably, hides archived customers from both lists, rejects new business, and retains existing invoices', async () => {
    const legacyId = newId('cli');
    await db.query(
      `INSERT INTO clients (id, organization_id, name, company_name, currency) VALUES ($1, $2, 'Legacy Active Client', '', 'USD')`,
      [legacyId, orgA]
    );
    const oldInvoiceId = newId('inv');
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_id, customer_id, client_name, issue_date, due_date, total_amount, balance_due, status)
       VALUES ($1, $2, $3, $4, $4, $5, '2026-09-01', '2026-09-30', 125.00, 125.00, 'DRAFT')`,
      [oldInvoiceId, orgA, `HIST-${suffix}`, customerId, `Updated Customer ${suffix}`]
    );
    const existingQuote = await QuotationEngine.createQuotation(orgA, {
      customerId, status: 'DRAFT', items: [{ name: 'Service', quantity: 1, rate: 100 }],
    });

    const archived = await request(app).post(`/api/v1/finance/customers/${customerId}/archive`).set(auth(tokenA)).send({});
    expect(archived.status).toBe(200);
    expect(archived.body).toMatchObject({ id: customerId, archived: true, changed: true, active: false });
    await db.query('UPDATE clients SET receivables_balance = 9876 WHERE organization_id = $1 AND id = $2', [orgA, customerId]);
    const repeated = await request(app).post(`/api/v1/finance/customers/${customerId}/archive`).set(auth(tokenA)).send({});
    expect(repeated.status).toBe(200);
    expect(repeated.body.changed).toBe(false);
    const balanceAfterRepeat = await db.query('SELECT receivables_balance FROM clients WHERE organization_id = $1 AND id = $2', [orgA, customerId]);
    expect(Number(balanceAfterRepeat.rows[0].receivables_balance)).toBe(9876);

    await expect(QuotationEngine.reviseQuotation(orgA, existingQuote.id, { notes: 'Edit archived customer quote' }))
      .rejects.toThrow(/Archived or unavailable customers/);
    await expect(QuotationEngine.reviseQuotation(orgA, existingQuote.id, { status: 'SENT' }))
      .rejects.toThrow(/Archived or unavailable customers/);

    const customers = await request(app).get('/api/v1/finance/customers').set(auth(tokenA));
    const clients = await request(app).get('/api/v1/finance/clients').set(auth(tokenA));
    expect(customers.body.some((row: any) => row.id === customerId)).toBe(false);
    expect(clients.body.some((row: any) => row.id === customerId)).toBe(false);
    expect(clients.body.some((row: any) => row.id === legacyId)).toBe(true);

    const project = await request(app).post('/api/v1/finance/projects').set(auth(tokenA)).send({
      code: `ARCH-${suffix}`, name: 'Archived customer project', customerId,
    });
    expect(project.status).toBe(400);

    const salesOrder = await request(app).post('/api/v1/finance/sales-orders').set(auth(tokenA)).send({
      customerId, lineItems: [{ name: 'Service', quantity: 1, unitPrice: 100 }],
    });
    expect(salesOrder.status).toBe(422);

    const quotation = await request(app).post('/api/v1/quotations').set(auth(tokenA)).send({
      customerId, items: [{ name: 'Service', quantity: 1, rate: 100 }],
    });
    expect(quotation.status).toBe(400);

    const invoice = await request(app).post('/api/v1/finance/invoices').set(auth(tokenA)).send({
      customerId, issueDate: '2026-09-23', dueDate: '2026-10-23',
      lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
    });
    expect(invoice.status).toBe(400);

    const portalToken = await request(app).post('/api/v1/stage6/portal/tokens').set(auth(tokenA)).send({ customerId });
    expect(portalToken.status).toBe(400);

    const history = await db.query('SELECT id, customer_id, client_id, total_amount FROM invoices WHERE organization_id = $1 AND id = $2', [orgA, oldInvoiceId]);
    expect(history.rows).toHaveLength(1);
    expect(history.rows[0]).toMatchObject({ id: oldInvoiceId, customer_id: customerId, client_id: customerId });
    expect(Number(history.rows[0].total_amount)).toBe(125);
  });
});
