import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import { MigrationRunner } from '../database/migrationRunner';
import { db } from '../database/db';
import { RbacService } from '../auth/RbacService';

describe('Phase 8.4B.1C — Backend Customer Search, Isolation & RBAC Test Suite', () => {
  let salesToken: string;
  let purchaseToken: string;
  let viewerToken: string;
  let orgAToken: string;
  let orgBToken: string;
  let itemIdToTest: string;
  let salesOrganizationId: string;
  let purchaseOrganizationId: string;
  let salesUserId: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();

    const timestamp = Date.now();

    // 1. Sales User Registration
    const salesReg = await request(app).post('/api/v1/auth/register').send({
      email: `sales-84b1c-${timestamp}@test.com`,
      password: 'Password123!',
      fullName: 'Sales User',
      organizationName: `Org Sales ${timestamp}`,
      role: 'Sales',
    });
    salesToken = salesReg.body.token;
    salesOrganizationId = salesReg.body.organizationId;
    salesUserId = salesReg.body.user.id;
    await db.query(
      `UPDATE organization_members SET role = 'Sales' WHERE organization_id = $1 AND user_id = $2`,
      [salesReg.body.organizationId, salesReg.body.user.id]
    );

    // 2. Purchase User Registration
    const purchaseReg = await request(app).post('/api/v1/auth/register').send({
      email: `purchase-84b1c-${timestamp}@test.com`,
      password: 'Password123!',
      fullName: 'Purchase User',
      organizationName: `Org Purchase ${timestamp}`,
      role: 'Purchase',
    });
    purchaseToken = purchaseReg.body.token;
    purchaseOrganizationId = purchaseReg.body.organizationId;
    await db.query(
      `UPDATE organization_members SET role = 'Purchase' WHERE organization_id = $1 AND user_id = $2`,
      [purchaseReg.body.organizationId, purchaseReg.body.user.id]
    );

    // 3. Viewer User Registration
    const viewerReg = await request(app).post('/api/v1/auth/register').send({
      email: `viewer-84b1c-${timestamp}@test.com`,
      password: 'Password123!',
      fullName: 'Viewer User',
      organizationName: `Org Viewer ${timestamp}`,
      role: 'Viewer',
    });
    viewerToken = viewerReg.body.token;
    await db.query(
      `UPDATE organization_members SET role = 'Viewer' WHERE organization_id = $1 AND user_id = $2`,
      [viewerReg.body.organizationId, viewerReg.body.user.id]
    );

    // 4. Org A Token
    const orgAReg = await request(app).post('/api/v1/auth/register').send({
      email: `orga-84b1c-${timestamp}@test.com`,
      password: 'Password123!',
      fullName: 'Org A Owner',
      organizationName: `Org A ${timestamp}`,
      role: 'Owner',
    });
    orgAToken = orgAReg.body.token;

    // 5. Org B Token
    const orgBReg = await request(app).post('/api/v1/auth/register').send({
      email: `orgb-84b1c-${timestamp}@test.com`,
      password: 'Password123!',
      fullName: 'Org B Owner',
      organizationName: `Org B ${timestamp}`,
      role: 'Owner',
    });
    orgBToken = orgBReg.body.token;

    // Create item under Sales role for testing updates/deletions
    const itemRes = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        name: 'Initial Sales Item',
        sku: `SKU-SALE-${timestamp}`,
        rate: 100,
      });
    itemIdToTest = itemRes.body.item.id;
  });

  it('exposes active organization item permissions using the route authorization rules', async () => {
    const sales = await request(app)
      .get('/api/v1/organizations/current/permissions')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(sales.status).toBe(200);
    expect(sales.headers['cache-control']).toBe('no-store');
    expect(sales.body.actions).toEqual({ itemsView: true, itemsCreate: true, itemsEdit: true, itemsArchive: false });

    const owner = await request(app)
      .get('/api/v1/organizations/current/permissions')
      .set('Authorization', `Bearer ${orgAToken}`);
    expect(owner.status).toBe(200);
    expect(owner.body.actions.itemsArchive).toBe(true);
  });
  // --- 1. Customer Search & Organization Security Tests ---
  it('1. GET /finance/customers?search=Alpha filters results and isolates cross-org customers', async () => {
    // Org A creates "Alpha Customer" & "Beta Customer"
    await request(app)
      .post('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ name: 'Alpha Customer', email: 'alpha@orga.com' });

    await request(app)
      .post('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ name: 'Beta Customer', email: 'beta@orga.com' });

    // Org B creates "Alpha Other Org"
    await request(app)
      .post('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${orgBToken}`)
      .send({ name: 'Alpha Other Org', email: 'alpha@orgb.com' });

    // Query Org A for "Alpha"
    const resA = await request(app)
      .get('/api/v1/finance/customers?search=Alpha')
      .set('Authorization', `Bearer ${orgAToken}`);

    expect(resA.status).toBe(200);
    expect(resA.body.length).toBe(1);
    expect(resA.body[0].display_name || resA.body[0].displayName).toBe('Alpha Customer');
  });

  it('2. Customer search handles SQL injection attempts safely via parameterized queries', async () => {
    const res = await request(app)
      .get("/api/v1/finance/customers?search=' OR 1=1 --")
      .set('Authorization', `Bearer ${orgAToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Should not dump all rows or cause SQL error
  });

  // --- 2. Sales Role RBAC Tests ---
  it('3. Sales role GET /finance/customers returns HTTP 200', async () => {
    const res = await request(app)
      .get('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(200);
  });

  it('4. Sales role POST /finance/customers returns HTTP 201', async () => {
    const res = await request(app)
      .post('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ name: 'Sales Added Customer' });
    expect(res.status).toBe(201);
  });

  it('5. Sales role GET /items returns HTTP 200', async () => {
    const res = await request(app)
      .get('/api/v1/items')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(200);
  });

  it('6. Sales role POST /items returns HTTP 201', async () => {
    const res = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ name: 'Sales Created Item', sku: `SKU-${Date.now()}` });
    expect(res.status).toBe(201);
  });

  it('7. Sales role PUT /items/:id returns HTTP 200', async () => {
    const res = await request(app)
      .put(`/api/v1/items/${itemIdToTest}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ name: 'Sales Updated Item' });
    expect(res.status).toBe(200);
  });

  it('8. Sales role DELETE /items/:id returns HTTP 403 Forbidden', async () => {
    const res = await request(app)
      .delete(`/api/v1/items/${itemIdToTest}`)
      .set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(403);
  });

  // --- 3. Purchase Role RBAC Tests ---
  it('9. Purchase role GET /finance/customers returns HTTP 403 Forbidden (Segregated)', async () => {
    const res = await request(app)
      .get('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${purchaseToken}`);
    expect(res.status).toBe(403);
  });

  it('10. Purchase role POST /finance/customers returns HTTP 403 Forbidden (Segregated)', async () => {
    const res = await request(app)
      .post('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${purchaseToken}`)
      .send({ name: 'Purchase Added Customer' });
    expect(res.status).toBe(403);
  });

  it('11. Purchase role GET /finance/projects returns HTTP 200', async () => {
    const res = await request(app)
      .get('/api/v1/finance/projects')
      .set('Authorization', `Bearer ${purchaseToken}`);
    expect(res.status).toBe(200);
  });

  it('12. Purchase role POST /finance/projects returns HTTP 403 Forbidden (Segregated)', async () => {
    const res = await request(app)
      .post('/api/v1/finance/projects')
      .set('Authorization', `Bearer ${purchaseToken}`)
      .send({ code: 'PRJ-PURCH', name: 'Purchase Added Project' });
    expect(res.status).toBe(403);
  });

  it('13. Purchase role GET /items returns HTTP 200', async () => {
    const res = await request(app)
      .get('/api/v1/items')
      .set('Authorization', `Bearer ${purchaseToken}`);
    expect(res.status).toBe(200);
  });

  it('14. Purchase role POST /items returns HTTP 201', async () => {
    const res = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${purchaseToken}`)
      .send({ name: 'Purchase Created Item', sku: `SKU-P-${Date.now()}` });
    expect(res.status).toBe(201);
  });

  it('15. Purchase role PUT /items/:id returns HTTP 200', async () => {
    const itemRes = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${purchaseToken}`)
      .send({ name: 'Purchase Item To Edit', sku: `SKU-PE-${Date.now()}` });

    const itemId = itemRes.body.item.id;

    const res = await request(app)
      .put(`/api/v1/items/${itemId}`)
      .set('Authorization', `Bearer ${purchaseToken}`)
      .send({ name: 'Purchase Updated Item' });
    expect(res.status).toBe(200);
  });

  it('16. Purchase role DELETE /items/:id returns HTTP 403 Forbidden', async () => {
    const res = await request(app)
      .delete(`/api/v1/items/${itemIdToTest}`)
      .set('Authorization', `Bearer ${purchaseToken}`);
    expect(res.status).toBe(403);
  });

  // --- 4. Viewer Role RBAC Tests ---
  it('17. Viewer role GET /finance/customers returns HTTP 200 (read-only allowed)', async () => {
    const res = await request(app)
      .get('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
  });

  it('18. Viewer role POST /finance/customers returns HTTP 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Forbidden Customer' });
    expect(res.status).toBe(403);
  });

  it('19. Viewer role POST /finance/projects returns HTTP 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/v1/finance/projects')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Forbidden Project' });
    expect(res.status).toBe(403);
  });

  it('20. Viewer role POST /items returns HTTP 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Forbidden Item' });
    expect(res.status).toBe(403);
  });

  it('21. Viewer role PUT /items/:id returns HTTP 403 Forbidden', async () => {
    const res = await request(app)
      .put(`/api/v1/items/${itemIdToTest}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Forbidden Edit' });
    expect(res.status).toBe(403);
  });

  it('22. Viewer role DELETE /items/:id returns HTTP 403 Forbidden', async () => {
    const res = await request(app)
      .delete(`/api/v1/items/${itemIdToTest}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });

  it('fails closed for empty custom roles and replays archive writes only with current grants', async () => {
    const suffix = Date.now();
    const extraItem = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('x-organization-id', salesOrganizationId)
      .send({ name: `Legacy Archive Item ${suffix}`, sku: `LEGACY-${suffix}` });
    expect(extraItem.status).toBe(201);

    const settingsItem = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('x-organization-id', salesOrganizationId)
      .send({ name: `Settings Archive Item ${suffix}`, sku: `SETTINGS-${suffix}` });
    expect(settingsItem.status).toBe(201);

    const emptyRole = await RbacService.createCustomRole(salesOrganizationId, {
      name: `No Grants ${suffix}`,
      permissions: [],
      userId: salesUserId,
    });
    await db.query('UPDATE organization_members SET role = $1 WHERE organization_id = $2 AND user_id = $3', [emptyRole.name, salesOrganizationId, salesUserId]);

    const emptyManifest = await request(app)
      .get('/api/v1/organizations/current/permissions')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('x-organization-id', salesOrganizationId);
    expect(emptyManifest.body.actions).toEqual({ itemsView: false, itemsCreate: false, itemsEdit: false, itemsArchive: false });
    const crossTenantManifest = await request(app)
      .get('/api/v1/organizations/current/permissions')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('x-organization-id', purchaseOrganizationId);
    expect(crossTenantManifest.status).toBe(403);
    const emptyRoleRead = await request(app)
      .get('/api/v1/items')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('x-organization-id', salesOrganizationId);
    expect(emptyRoleRead.status).toBe(403);
    expect(await RbacService.getPermissionsForRoleAsync(salesOrganizationId, `Missing Role ${suffix}`, true)).toEqual([]);

    const archiveRole = await RbacService.createCustomRole(salesOrganizationId, {
      name: `Item Archivist ${suffix}`,
      permissions: ['items.archive'],
      userId: salesUserId,
    });
    await db.query('UPDATE organization_members SET role = $1 WHERE organization_id = $2 AND user_id = $3', [archiveRole.name, salesOrganizationId, salesUserId]);
    const archivePermissions = await request(app)
      .get('/api/v1/organizations/current/permissions')
      .set('Authorization', `Bearer ${salesToken}`)
      .set('x-organization-id', salesOrganizationId);
    expect(archivePermissions.body.actions).toMatchObject({ itemsView: false, itemsArchive: true });

    const itemId = extraItem.body.item.id;
    const archiveKey = `custom-archive-${suffix}`;
    const firstArchive = await request(app)
      .delete(`/api/v1/items/${itemId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .set('x-organization-id', salesOrganizationId)
      .set('Idempotency-Key', archiveKey);
    expect(firstArchive.status).toBe(200);
    const replayArchive = await request(app)
      .delete(`/api/v1/items/${itemId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .set('x-organization-id', salesOrganizationId)
      .set('Idempotency-Key', archiveKey);
    expect(replayArchive.status).toBe(200);
    expect(replayArchive.body).toEqual(firstArchive.body);
    const archiveAudit = await db.query(
      `SELECT COUNT(*)::int as count FROM audit_logs WHERE organization_id = $1 AND action = 'ITEM_ARCHIVED' AND entity_id = $2`,
      [salesOrganizationId, itemId]
    );
    expect(archiveAudit.rows[0].count).toBe(1);

    await db.query('UPDATE organization_members SET role = $1 WHERE organization_id = $2 AND user_id = $3', [emptyRole.name, salesOrganizationId, salesUserId]);
    const revokedReplay = await request(app)
      .delete(`/api/v1/items/${itemId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .set('x-organization-id', salesOrganizationId)
      .set('Idempotency-Key', archiveKey);
    expect(revokedReplay.status).toBe(403);

    const legacyRole = await RbacService.createCustomRole(salesOrganizationId, {
      name: `Legacy Item Admin ${suffix}`,
      permissions: ['roles.manage'],
      userId: salesUserId,
    });
    await db.query('UPDATE organization_members SET role = $1 WHERE organization_id = $2 AND user_id = $3', [legacyRole.name, salesOrganizationId, salesUserId]);
    const legacyKey = `legacy-archive-${suffix}`;
    const legacyArchive = await request(app)
      .delete(`/api/v1/items/${itemIdToTest}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .set('x-organization-id', salesOrganizationId)
      .set('Idempotency-Key', legacyKey);
    expect(legacyArchive.status).toBe(200);
    const legacyReplay = await request(app)
      .delete(`/api/v1/items/${itemIdToTest}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .set('x-organization-id', salesOrganizationId)
      .set('Idempotency-Key', legacyKey);
    expect(legacyReplay.status).toBe(200);
    expect(legacyReplay.body).toEqual(legacyArchive.body);
    const settingsRole = await RbacService.createCustomRole(salesOrganizationId, {
      name: `Settings User Admin ${suffix}`,
      permissions: [],
      userId: salesUserId,
    });
    await db.query('UPDATE organization_members SET role = $1 WHERE organization_id = $2 AND user_id = $3', [settingsRole.name, salesOrganizationId, salesUserId]);
    await db.query('INSERT INTO role_permissions (role_id, permission_code) VALUES ($1, $2)', [settingsRole.id, 'settings.manage_users']);
    const settingsKey = `settings-archive-${suffix}`;
    const settingsArchive = await request(app)
      .delete(`/api/v1/items/${settingsItem.body.item.id}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .set('x-organization-id', salesOrganizationId)
      .set('Idempotency-Key', settingsKey);
    expect(settingsArchive.status).toBe(200);
    const settingsReplay = await request(app)
      .delete(`/api/v1/items/${settingsItem.body.item.id}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .set('x-organization-id', salesOrganizationId)
      .set('Idempotency-Key', settingsKey);
    expect(settingsReplay.status).toBe(200);
    expect(settingsReplay.body).toEqual(settingsArchive.body);
  });
});
