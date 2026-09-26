import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { RoutePermissionRegistry } from '../auth/RoutePermissionRegistry';
import { QuotationEngine } from '../sales/QuotationEngine';
import { BudgetService } from '../services/BudgetService';
import { FixedAssetService } from '../services/FixedAssetService';

describe('Project lifecycle API', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let token: string;
  let tokenOther: string;
  let organizationId: string;
  let ownerUserId: string;
  let customerId: string;
  let projectId: string;
  const auth = (value: string) => ({ Authorization: `Bearer ${value}` });

  beforeAll(async () => {
    await MigrationRunner.runMigrations();
    const first = await request(app).post('/api/v1/auth/register').send({
      email: `project-lifecycle-${suffix}@test.com`, password: 'Password123!', fullName: 'Project Lifecycle Owner',
      organizationName: `Project Lifecycle ${suffix}`, role: 'Owner',
    });
    expect(first.status).toBe(201);
    token = first.body.token;
    ownerUserId = first.body.user.id;
    organizationId = first.body.organizationId;
    const second = await request(app).post('/api/v1/auth/register').send({
      email: `project-lifecycle-other-${suffix}@test.com`, password: 'Password123!', fullName: 'Other Project Owner',
      organizationName: `Other Project ${suffix}`, role: 'Owner',
    });
    expect(second.status).toBe(201);
    tokenOther = second.body.token;
    const customer = await request(app).post('/api/v1/finance/customers').set(auth(token)).send({ displayName: `Project Customer ${suffix}` });
    expect(customer.status).toBe(201);
    customerId = customer.body.id;
    const created = await request(app).post('/api/v1/finance/projects').set(auth(token)).send({
      code: `PL-${suffix}`, name: `Lifecycle Project ${suffix}`, customerId,
      budgetType: 'Time & Materials', totalBudget: 1000, hourlyRate: 125, startDate: '2026-09-01',
    });
    expect(created.status).toBe(201);
    projectId = created.body.id;
  });

  it('recovers a time-entry create only from its same-user server idempotency receipt', async () => {
    const key = `time-entry-receipt-${suffix}`;
    const body = { projectId, staffName: '  Receipt Tester  ', taskName: '  Recovery  ', date: '2026-09-24', hours: 1.25, hourlyRate: 125, isBillable: true, description: 'status receipt' };
    const created = await request(app).post('/api/v1/finance/time-entries').set({ ...auth(token), 'Idempotency-Key': key }).send(body);
    expect(created.status).toBe(201);

    const status = await request(app).get('/api/v1/finance/time-entries/create-operation-status').set({ ...auth(token), 'Idempotency-Key': key });
    expect(status.status).toBe(200);
    expect(status.body).toEqual({ state: 'COMPLETED', responseStatus: 201, entryId: created.body.id });

    const invoiceCreatorRole = `Invoice Receipt Creator ${suffix}`;
    const invoiceCreatorRoleId = `role-invoice-receipt-${suffix}`;
    await db.query('INSERT INTO roles (id, organization_id, name, description, is_system_role) VALUES ($1, $2, $3, $4, FALSE)', [invoiceCreatorRoleId, organizationId, invoiceCreatorRole, 'Invoice-create-only recovery test role']);
    await db.query('INSERT INTO role_permissions (role_id, permission_code) VALUES ($1, $2)', [invoiceCreatorRoleId, 'invoices.create']);
    try {
      await db.query('UPDATE organization_members SET role = $1 WHERE organization_id = $2 AND user_id = $3', [invoiceCreatorRole, organizationId, ownerUserId]);
      const invoiceCreatorStatus = await request(app).get('/api/v1/finance/time-entries/create-operation-status').set({ ...auth(token), 'Idempotency-Key': key });
      expect(invoiceCreatorStatus.status).toBe(200);
      expect(invoiceCreatorStatus.body).toEqual({ state: 'COMPLETED', responseStatus: 201, entryId: created.body.id });
    } finally {
      await db.query('UPDATE organization_members SET role = $1 WHERE organization_id = $2 AND user_id = $3', ['Owner', organizationId, ownerUserId]);
      await db.query('DELETE FROM role_permissions WHERE role_id = $1', [invoiceCreatorRoleId]);
      await db.query('DELETE FROM roles WHERE id = $1 AND organization_id = $2', [invoiceCreatorRoleId, organizationId]);
    }

    const replay = await request(app).post('/api/v1/finance/time-entries').set({ ...auth(token), 'Idempotency-Key': key }).send(body);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(created.body.id);
    const rows = await db.query('SELECT id FROM time_entries WHERE organization_id = $1 AND id = $2', [organizationId, created.body.id]);
    expect(rows.rows).toHaveLength(1);
    await db.query('DELETE FROM time_entries WHERE organization_id = $1 AND id = $2', [organizationId, created.body.id]);

    const otherTenant = await request(app).get('/api/v1/finance/time-entries/create-operation-status').set({ ...auth(tokenOther), 'Idempotency-Key': key });
    expect(otherTenant.status).toBe(200);
    expect(otherTenant.body).toEqual({ state: 'UNKNOWN' });
  });

  it('registers replay permissions and protects tenant boundaries', async () => {
    expect(RoutePermissionRegistry.getRequiredPermissions('PATCH', `/api/v1/finance/projects/${projectId}`)).toEqual(['projects.edit']);
    expect(RoutePermissionRegistry.getRequiredPermissions('POST', `/api/v1/finance/projects/${projectId}/archive`)).toEqual(['projects.archive']);
    expect(RoutePermissionRegistry.getRequiredPermissions('POST', '/api/v1/finance/time-entries')).toEqual(['projects.time_entries', 'invoices.create']);
    const crossTenant = await request(app).patch(`/api/v1/finance/projects/${projectId}`).set(auth(tokenOther)).send({ name: 'Cross tenant' });
    expect(crossTenant.status).toBe(404);
  });

  it('returns calendar dates consistently and only derives customer names from the assigned customer', async () => {
    const dateResult = await request(app).patch(`/api/v1/finance/projects/${projectId}`).set(auth(token)).send({ startDate: '2026-09-01' });
    expect(dateResult.status).toBe(200);
    expect(dateResult.body.startDate).toBe('2026-09-01');
    const dateNoOp = await request(app).patch(`/api/v1/finance/projects/${projectId}`).set(auth(token)).send({ startDate: '2026-09-01' });
    expect(dateNoOp.status).toBe(200);
    expect(dateNoOp.body.changed).toBe(false);
    const listed = await request(app).get('/api/v1/finance/projects').set(auth(token));
    expect(listed.status).toBe(200);
    expect(listed.body.find((row: any) => row.id === projectId).start_date).toBe('2026-09-01');

    const injectedName = await request(app).patch(`/api/v1/finance/projects/${projectId}`).set(auth(token)).send({ clientName: 'Forged Customer Name' });
    expect(injectedName.status).toBe(400);
    expect(injectedName.body.error).toMatch(/Unsupported project fields/);
    const snapshot = await db.query('SELECT client_name FROM projects WHERE organization_id = $1 AND id = $2', [organizationId, projectId]);
    expect(snapshot.rows[0].client_name).toBe(`Project Customer ${suffix}`);
  });

  it('canonicalizes a legacy client before project assignment and audits the promotion', async () => {
    const legacyId = `legacy-project-customer-${suffix}`;
    await db.query(
      `INSERT INTO clients (id, organization_id, name, company_name, currency) VALUES ($1, $2, $3, $4, 'INR')`,
      [legacyId, organizationId, `Legacy Project Customer ${suffix}`, `Legacy Co ${suffix}`]
    );
    const project = await request(app).post('/api/v1/finance/projects').set(auth(token)).send({
      code: `LEGACY-${suffix}`, name: 'Legacy customer project', customerId: legacyId,
    });
    expect(project.status).toBe(201);
    expect(project.body.clientName).toBe(`Legacy Project Customer ${suffix}`);
    const canonical = await db.query('SELECT id, display_name FROM customers WHERE organization_id = $1 AND id = $2', [organizationId, legacyId]);
    expect(canonical.rows).toEqual([{ id: legacyId, display_name: `Legacy Project Customer ${suffix}` }]);
    const audit = await db.query("SELECT action FROM audit_logs WHERE organization_id = $1 AND entity_type = 'Customer' AND entity_id = $2 AND action = 'CUSTOMER_CANONICALIZED_FROM_CLIENT'", [organizationId, legacyId]);
    expect(audit.rows).toHaveLength(1);
  });
  it('validates unique codes and freezes linked code/customer metadata', async () => {
    const duplicate = await request(app).post('/api/v1/finance/projects').set(auth(token)).send({ code: `PL-${suffix}`, name: 'Duplicate code' });
    expect(duplicate.status).toBe(409);
    const time = await request(app).post('/api/v1/finance/time-entries').set(auth(token)).send({
      projectId, staffName: 'A Staff', taskName: 'Implementation', date: '2026-09-20', hours: 1, hourlyRate: 125,
    });
    expect(time.status).toBe(201);
    const frozen = await request(app).patch(`/api/v1/finance/projects/${projectId}`).set(auth(token)).send({ code: `NEW-${suffix}` });
    expect(frozen.status).toBe(409);
    const metadata = await request(app).patch(`/api/v1/finance/projects/${projectId}`).set(auth(token)).send({ description: 'Linked metadata remains editable' });
    expect(metadata.status).toBe(200);
    expect(metadata.body).toMatchObject({ id: projectId, changed: true, description: 'Linked metadata remains editable' });
    await db.query('UPDATE customers SET active = FALSE WHERE organization_id = $1 AND id = $2', [organizationId, customerId]);
    const archivedCustomerMetadata = await request(app).patch(`/api/v1/finance/projects/${projectId}`).set(auth(token)).send({ clientId: customerId, description: 'Still editable with historical customer' });
    await db.query('UPDATE customers SET active = TRUE WHERE organization_id = $1 AND id = $2', [organizationId, customerId]);
    expect(archivedCustomerMetadata.status).toBe(200);
    expect(archivedCustomerMetadata.body.clientName).toBe(`Project Customer ${suffix}`);
    const claimAccount = await db.query('SELECT id FROM accounts WHERE organization_id = $1 ORDER BY code LIMIT 1', [organizationId]);
    await db.query(
      `INSERT INTO employee_claim_items (id, organization_id, claim_id, expense_account_id, date, amount, project_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [`claim-item-${suffix}`, organizationId, `claim-${suffix}`, claimAccount.rows[0].id, '2026-09-20', 10, projectId]
    );
    const claimLinked = await request(app).patch(`/api/v1/finance/projects/${projectId}`).set(auth(token)).send({ code: `CHANGED-${suffix}` });
    expect(claimLinked.status).toBe(409);
    const auditBeforeNoOp = await db.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE organization_id = $1 AND entity_type = 'Project' AND entity_id = $2 AND action = 'PROJECT_UPDATED'", [organizationId, projectId]);
    const noOp = await request(app).patch(`/api/v1/finance/projects/${projectId}`).set(auth(token)).send({ description: 'Still editable with historical customer' });
    expect(noOp.status).toBe(200);
    expect(noOp.body.changed).toBe(false);
    const auditAfterNoOp = await db.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE organization_id = $1 AND entity_type = 'Project' AND entity_id = $2 AND action = 'PROJECT_UPDATED'", [organizationId, projectId]);
    expect(auditAfterNoOp.rows[0].count).toBe(auditBeforeNoOp.rows[0].count);
  });

  it('archives idempotently, rejects new attachments, and settles pre-archive time', async () => {
    const quote = await QuotationEngine.createQuotation(organizationId, {
      customerId, projectId, status: 'DRAFT', items: [{ name: 'Pre-archive service', quantity: 1, rate: 100 }],
    });
    const projectAccounts = await db.query('SELECT id, code FROM accounts WHERE organization_id = $1 ORDER BY code', [organizationId]);
    const historicalBudget = await BudgetService.createBudget(organizationId, ownerUserId, {
      name: `Pre-archive budget ${suffix}`, financialYear: '2026-27',
      lines: [{ accountId: projectAccounts.rows[0].id, projectId, periodKey: '2026-09', amount: 50 }],
    });
    const historicalAsset = await FixedAssetService.createAsset(organizationId, ownerUserId, {
      assetCode: `PRE-${suffix}`, name: 'Pre-archive equipment', assetCategory: 'Equipment',
      purchaseDate: '2026-09-01', inServiceDate: '2026-09-01', purchaseValue: 100,
      usefulLifeMonths: 12, assetAccountId: projectAccounts.rows[0].id,
      accumulatedDepreciationAccountId: projectAccounts.rows[1].id,
      depreciationExpenseAccountId: projectAccounts.rows[2].id, projectId,
    });
    const auditBeforeArchive = await db.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE organization_id = $1 AND entity_type = 'Project' AND entity_id = $2 AND action = 'PROJECT_ARCHIVED'", [organizationId, projectId]);
    const key = `project-archive-${suffix}-001`;
    const archived = await request(app).post(`/api/v1/finance/projects/${projectId}/archive`).set(auth(token)).set('Idempotency-Key', key).send({});
    expect(archived.status).toBe(200);
    expect(archived.body).toMatchObject({ id: projectId, archived: true, changed: true });
    expect(archived.body.archivedAt).toBeTruthy();
    const auditAfterArchive = await db.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE organization_id = $1 AND entity_type = 'Project' AND entity_id = $2 AND action = 'PROJECT_ARCHIVED'", [organizationId, projectId]);
    expect(auditAfterArchive.rows[0].count).toBe(auditBeforeArchive.rows[0].count + 1);
    const replayed = await request(app).post(`/api/v1/finance/projects/${projectId}/archive`).set(auth(token)).set('Idempotency-Key', key).send({});
    expect(replayed.status).toBe(200);
    expect(replayed.body).toMatchObject({ id: projectId, archived: true });
    const again = await request(app).post(`/api/v1/finance/projects/${projectId}/archive`).set(auth(token)).send({});
    expect(again.status).toBe(200);
    expect(again.body.changed).toBe(false);
    const auditAfterRepeat = await db.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE organization_id = $1 AND entity_type = 'Project' AND entity_id = $2 AND action = 'PROJECT_ARCHIVED'", [organizationId, projectId]);
    expect(auditAfterRepeat.rows[0].count).toBe(auditAfterArchive.rows[0].count);
    const blocked = await request(app).post('/api/v1/finance/time-entries').set(auth(token)).send({
      projectId, staffName: 'A Staff', taskName: 'New work', date: '2026-09-21', hours: 1, hourlyRate: 125,
    });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error).toMatch(/Archived projects/);
    await expect(QuotationEngine.createQuotation(organizationId, {
      customerId, projectId, status: 'DRAFT', items: [{ name: 'New service', quantity: 1, rate: 100 }],
    })).rejects.toThrow(/Archived projects/);
    await expect(QuotationEngine.reviseQuotation(organizationId, quote.id, { notes: 'Attempt after archive' }))
      .rejects.toThrow(/Archived projects/);
    const order = await request(app).post('/api/v1/finance/sales-orders').set(auth(token)).send({
      customerId, projectId, lineItems: [{ name: 'New order', quantity: 1, unitPrice: 100 }],
    });
    expect(order.status).toBe(422);
    expect(order.body.error).toMatch(/Archived projects/);
    const invoice = await request(app).post('/api/v1/finance/invoices').set(auth(token)).send({
      clientId: customerId, projectId, issueDate: '2026-09-23', dueDate: '2026-10-23',
      items: [{ description: 'New invoice', quantity: 1, unitPrice: 100 }],
    });
    expect(invoice.status).toBe(422);
    expect(invoice.body.error).toMatch(/Archived projects/);
    const accounts = await db.query('SELECT id, code FROM accounts WHERE organization_id = $1', [organizationId]);
    const retainedBudgetLine = await db.query('SELECT project_id FROM budget_lines WHERE organization_id = $1 AND budget_id = $2', [organizationId, historicalBudget.id]);
    expect(retainedBudgetLine.rows[0].project_id).toBe(projectId);
    const retainedAssets = await FixedAssetService.getAssets(organizationId);
    expect(retainedAssets.find((asset: any) => asset.id === historicalAsset.id).project_id).toBe(projectId);
    await expect(BudgetService.createBudget(organizationId, ownerUserId, {
      name: `Post-archive budget ${suffix}`, financialYear: '2026-27',
      lines: [{ accountId: projectAccounts.rows[0].id, projectId, periodKey: '2026-09', amount: 50 }],
    })).rejects.toThrow(/Archived projects/);
    await expect(FixedAssetService.createAsset(organizationId, ownerUserId, {
      assetCode: `POST-${suffix}`, name: 'Post-archive equipment', assetCategory: 'Equipment',
      purchaseDate: '2026-09-01', inServiceDate: '2026-09-01', purchaseValue: 100,
      usefulLifeMonths: 12, assetAccountId: projectAccounts.rows[0].id,
      accumulatedDepreciationAccountId: projectAccounts.rows[1].id,
      depreciationExpenseAccountId: projectAccounts.rows[2].id, projectId,
    })).rejects.toThrow(/Archived projects/);
    const expense = await request(app).post('/api/v1/finance/expenses').set(auth(token)).send({
      expenseAccountId: accounts.rows.find((row) => row.code === '6000').id,
      paidFromAccountId: accounts.rows.find((row) => row.code === '1000').id,
      projectId, clientId: customerId, date: '2026-09-23', amount: 10,
    });
    expect([400, 422]).toContain(expense.status);
    expect(expense.body.error).toMatch(/Archived projects/);
    const history = await request(app).get('/api/v1/finance/projects').set(auth(token));
    expect(history.status).toBe(200);
    expect(history.body.some((row: any) => row.id === projectId && row.archived_at)).toBe(true);
    await db.query('UPDATE customers SET active = FALSE WHERE organization_id = $1 AND id = $2', [organizationId, customerId]);
    const settlement = await request(app).post(`/api/v1/finance/projects/${projectId}/invoice-unbilled-time`).set(auth(token)).send({ issueDate: '2026-09-23', dueDate: '2026-10-23' });
    expect(settlement.status).toBe(201);
    const billed = await db.query('SELECT is_billed, invoice_id FROM time_entries WHERE organization_id = $1 AND project_id = $2', [organizationId, projectId]);
    expect(billed.rows.length).toBe(1);
    expect(billed.rows[0].is_billed).toBe(true);
    expect(billed.rows[0].invoice_id).toBe(settlement.body.id);
    await db.query('UPDATE customers SET active = TRUE WHERE organization_id = $1 AND id = $2', [organizationId, customerId]);
  });

  it('keeps concurrent budget and asset attachment outcomes atomic with archive', async () => {
    const fresh = await request(app).post('/api/v1/finance/projects').set(auth(token)).send({
      code: `ARCHIVE-ATTACH-${suffix}`, name: 'Archive attachment race', customerId,
    });
    expect(fresh.status).toBe(201);
    const accounts = await db.query('SELECT id FROM accounts WHERE organization_id = $1 ORDER BY code LIMIT 3', [organizationId]);
    let archiveRequest: Promise<any>;
    let budgetRequest: Promise<any>;
    let assetRequest: Promise<any>;
    await db.transaction(async (client) => {
      await client.query('SELECT id FROM projects WHERE organization_id = $1 AND id = $2 FOR UPDATE', [organizationId, fresh.body.id]);
      archiveRequest = request(app).post(`/api/v1/finance/projects/${fresh.body.id}/archive`).set(auth(token)).send({});
      await new Promise((resolve) => setTimeout(resolve, 100));
      budgetRequest = BudgetService.createBudget(organizationId, ownerUserId, {
        name: `Racing budget ${suffix}`, financialYear: '2026-27',
        lines: [{ accountId: accounts.rows[0].id, projectId: fresh.body.id, periodKey: '2026-09', amount: 10 }],
      });
      assetRequest = FixedAssetService.createAsset(organizationId, ownerUserId, {
        assetCode: `RACE-${suffix}`, name: 'Racing equipment', assetCategory: 'Equipment',
        purchaseDate: '2026-09-01', inServiceDate: '2026-09-01', purchaseValue: 10,
        usefulLifeMonths: 12, assetAccountId: accounts.rows[0].id,
        accumulatedDepreciationAccountId: accounts.rows[1].id,
        depreciationExpenseAccountId: accounts.rows[2].id, projectId: fresh.body.id,
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    const [archived, attachments] = await Promise.all([archiveRequest!, Promise.allSettled([budgetRequest!, assetRequest!])]);
    expect(archived.status).toBe(200);
    const archivedProject = await db.query('SELECT archived_at FROM projects WHERE organization_id = $1 AND id = $2', [organizationId, fresh.body.id]);
    expect(archivedProject.rows[0].archived_at).toBeTruthy();
    const budgetResult = attachments[0];
    const assetResult = attachments[1];
    const budgetLines = await db.query('SELECT id FROM budget_lines WHERE organization_id = $1 AND project_id = $2', [organizationId, fresh.body.id]);
    const projectAssets = await db.query('SELECT id FROM fixed_assets WHERE organization_id = $1 AND project_id = $2', [organizationId, fresh.body.id]);
    expect(budgetLines.rows).toHaveLength(budgetResult.status === 'fulfilled' ? 1 : 0);
    expect(projectAssets.rows).toHaveLength(assetResult.status === 'fulfilled' ? 1 : 0);
  });
  it('serializes new time attachment against archive using the canonical project lock', async () => {
    const fresh = await request(app).post('/api/v1/finance/projects').set(auth(token)).send({
      code: `RACE-${suffix}`, name: 'Archive race project', customerId,
    });
    expect(fresh.status).toBe(201);
    let archiveRequest: Promise<any>;
    let timeRequest: Promise<any>;
    await db.transaction(async (client) => {
      await client.query('SELECT id FROM projects WHERE organization_id = $1 AND id = $2 FOR UPDATE', [organizationId, fresh.body.id]);
      archiveRequest = request(app).post(`/api/v1/finance/projects/${fresh.body.id}/archive`).set(auth(token)).send({});
      await new Promise((resolve) => setTimeout(resolve, 100));
      timeRequest = request(app).post('/api/v1/finance/time-entries').set(auth(token)).send({
        projectId: fresh.body.id, staffName: 'Race Staff', taskName: 'Race Work', date: '2026-09-22', hours: 1, hourlyRate: 100,
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    const [archived, time] = await Promise.all([archiveRequest!, timeRequest!]);
    expect(archived.status).toBe(200);
    expect([201, 422]).toContain(time.status);
    const linked = await db.query('SELECT id FROM time_entries WHERE organization_id = $1 AND project_id = $2', [organizationId, fresh.body.id]);
    expect(linked.rows).toHaveLength(time.status === 201 ? 1 : 0);
  });

  it('rechecks replay permissions after project edit permission is revoked', async () => {
    const key = `project-edit-${suffix}-001`;
    const fresh = await request(app).post('/api/v1/finance/projects').set(auth(token)).send({ code: `REPLAY-${suffix}`, name: 'Replay permission project' });
    expect(fresh.status).toBe(201);
    const payload = { description: `Replay test ${suffix}` };
    const first = await request(app).patch(`/api/v1/finance/projects/${fresh.body.id}`).set(auth(token)).set('Idempotency-Key', key).send(payload);
    expect(first.status).toBe(200);
    await db.query(`UPDATE organization_members SET role = 'Viewer' WHERE organization_id = $1 AND user_id = $2`, [organizationId, ownerUserId]);
    const replay = await request(app).patch(`/api/v1/finance/projects/${fresh.body.id}`).set(auth(token)).set('Idempotency-Key', key).send(payload);
    await db.query(`UPDATE organization_members SET role = 'Owner' WHERE organization_id = $1 AND user_id = $2`, [organizationId, ownerUserId]);
    expect(replay.status).toBe(403);
  });
});
