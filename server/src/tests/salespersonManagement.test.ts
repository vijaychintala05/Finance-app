import { beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { db } from '../database/db';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';
import { JwtAuth } from '../auth/jwt';
import { authMiddleware, organizationIsolationMiddleware } from '../middleware/organizationIsolation.middleware';
import financeRoutes from '../routes/finance.routes';
import { SalesEngine } from '../sales/SalesEngine';
import { FinanceController } from '../controllers/financeController';
import { ReportWorkspaceService } from '../services/ReportWorkspaceService';

const app = express();
app.use(express.json());
app.use(authMiddleware);
app.use(organizationIsolationMiddleware);
app.use('/api/v1/finance', financeRoutes);
const http = request(app);

describe('Salesperson management API', () => {
  const organizationId = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
  const ownerId = MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.owner.id;
  const token = JwtAuth.generateToken({ userId: ownerId, email: 'owner@salesperson-test.example' });
  const headers = { Authorization: `Bearer ${token}`, 'x-organization-id': organizationId };

  beforeAll(async () => {
    await MasterFinanceFixture.setup({ usePgMem: true });
  });

  it('validates, creates and edits real salesperson records with stale-write protection', async () => {
    const code = `REP-${Date.now()}`;
    const invalid = await http.post('/api/v1/finance/salespersons').set(headers).send({
      code: `${code}-BAD`, name: 'Sales Rep', email: 'not-an-email', commissionRate: 5,
    });
    expect(invalid.status).toBe(400);

    const created = await http.post('/api/v1/finance/salespersons').set(headers).send({
      code, name: '  Alex Rep  ', email: 'Alex.Rep@example.com', commissionRate: '5.25', region: 'West',
    });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Alex Rep');
    expect(created.body.email).toBe('alex.rep@example.com');
    expect(Number(created.body.commission_rate)).toBe(5.25);

    const duplicate = await http.post('/api/v1/finance/salespersons').set(headers).send({
      code: code.toLowerCase(), name: 'Duplicate Rep', commissionRate: 0,
    });
    expect(duplicate.status).toBe(409);

    const changed = await http.patch(`/api/v1/finance/salespersons/${created.body.id}`).set(headers).send({
      name: 'Alex Rivera', updatedAt: created.body.updated_at,
    });
    expect(changed.status).toBe(200);
    expect(changed.body.name).toBe('Alex Rivera');
    expect(changed.body.changed).toBe(true);    expect(Date.parse(changed.body.updated_at)).toBeGreaterThan(Date.parse(created.body.updated_at));
    const noOp = await http.patch(`/api/v1/finance/salespersons/${created.body.id}`).set(headers).send({
      name: 'Alex Rivera', updatedAt: changed.body.updated_at,
    });
    expect(noOp.status).toBe(200);
    expect(noOp.body.changed).toBe(false);
    expect(noOp.body.updated_at).toBe(changed.body.updated_at);

    const stale = await http.patch(`/api/v1/finance/salespersons/${created.body.id}`).set(headers).send({
      name: 'Stale Write', updatedAt: created.body.updated_at,
    });
    expect(stale.status).toBe(409);
  });

  it('blocks deactivation while assigned to active customers and preserves the historical record', async () => {
    const suffix = Date.now();
    const createSalesperson = async (name: string) => {
      const response = await http.post('/api/v1/finance/salespersons').set(headers).send({
        code: `ARCH-${suffix}-${name.replace(/\W/g, '')}`, name, commissionRate: 0,
      });
      expect(response.status).toBe(201);
      return response.body;
    };
    const assignedRep = await createSalesperson('Assigned Rep');
    const replacementRep = await createSalesperson('Replacement Rep');
    const customer = await http.post('/api/v1/finance/customers').set(headers).send({
      displayName: `Salesperson Customer ${suffix}`, name: `Salesperson Customer ${suffix}`, salespersonId: assignedRep.id,
    });
    expect(customer.status).toBe(201);    const inheritedInvoice = await SalesEngine.createAndPostInvoice(organizationId, {
      customerId: customer.body.id, issueDate: '2026-08-01', dueDate: '2026-08-30', status: 'POSTED',
      lineItems: [{ description: 'Customer default salesperson', quantity: 1, unitPrice: 25, taxRate: 0 }],
    });
    const inheritedSnapshot = await db.query(
      'SELECT salesperson_id, salesperson_name_snapshot FROM invoices WHERE organization_id = $1 AND id = $2',
      [organizationId, inheritedInvoice.id],
    );
    expect(inheritedSnapshot.rows[0]).toMatchObject({ salesperson_id: assignedRep.id, salesperson_name_snapshot: 'Assigned Rep' });

    const blocked = await http.post(`/api/v1/finance/salespersons/${assignedRep.id}/archive`).set(headers).send({});
    expect(blocked.status).toBe(409);

    const reassigned = await http.patch(`/api/v1/finance/customers/${customer.body.id}`).set(headers).send({
      salespersonId: replacementRep.id,
    });
    expect(reassigned.status).toBe(200);
    const archived = await http.post(`/api/v1/finance/salespersons/${assignedRep.id}/archive`).set(headers).send({});
    expect(archived.status).toBe(200);
    expect(archived.body.active).toBe(false);    expect(Date.parse(archived.body.updated_at)).toBeGreaterThan(Date.parse(assignedRep.updated_at));
    const restored = await http.post(`/api/v1/finance/salespersons/${assignedRep.id}/restore`).set(headers).send({});
    expect(restored.status).toBe(200);
    expect(Date.parse(restored.body.updated_at)).toBeGreaterThan(Date.parse(archived.body.updated_at));

    const listed = await http.get('/api/v1/finance/salespersons').set(headers);
    expect(listed.status).toBe(200);
    expect(listed.body.find((row: any) => row.id === assignedRep.id).status).toBe('ACTIVE');
    expect(await db.query('SELECT id FROM salespersons WHERE organization_id = $1 AND id = $2', [organizationId, assignedRep.id]).then((result) => result.rows)).toHaveLength(1);
  });
  it('stores invoice-time salesperson snapshots and reports the invoice attribution', async () => {
    const suffix = Date.now();
    const created = await http.post('/api/v1/finance/salespersons').set(headers).send({
      code: `SNAP-${suffix}`, name: 'Snapshot Rep', commissionRate: 6.5,
    });
    expect(created.status).toBe(201);

    const invoice = await SalesEngine.createAndPostInvoice(organizationId, {
      customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
      issueDate: '2026-09-12', dueDate: '2026-09-30', status: 'POSTED',
      salespersonId: created.body.id,
      lineItems: [{ description: 'Salesperson attribution test', quantity: 1, unitPrice: 100, taxRate: 0 }],
    });
    const snapshot = await db.query(
      'SELECT salesperson_id, salesperson_name_snapshot, salesperson_code_snapshot, commission_rate_snapshot FROM invoices WHERE organization_id = $1 AND id = $2',
      [organizationId, invoice.id],
    );
    expect(snapshot.rows[0]).toMatchObject({
      salesperson_id: created.body.id,
      salesperson_name_snapshot: 'Snapshot Rep',
      salesperson_code_snapshot: `SNAP-${suffix}`,
    });
    expect(Number(snapshot.rows[0].commission_rate_snapshot)).toBe(6.5);

    const renamed = await http.patch(`/api/v1/finance/salespersons/${created.body.id}`).set(headers).send({
      name: 'Renamed Rep', updatedAt: created.body.updated_at,
    });
    expect(renamed.status).toBe(200);    const invoiceAfterRename = await SalesEngine.createAndPostInvoice(organizationId, {
      customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
      issueDate: '2026-09-13', dueDate: '2026-09-30', status: 'POSTED', salespersonId: created.body.id,
      lineItems: [{ description: 'Post-rename attribution test', quantity: 1, unitPrice: 100, taxRate: 0 }],
    });
    const secondSnapshot = await db.query(
      'SELECT salesperson_name_snapshot FROM invoices WHERE organization_id = $1 AND id = $2',
      [organizationId, invoiceAfterRename.id],
    );
    expect(secondSnapshot.rows[0].salesperson_name_snapshot).toBe('Renamed Rep');
    const renamedReport = await ReportWorkspaceService.run(organizationId, 'sales_by_salesperson', {
      fromDate: '2026-09-01', toDate: '2026-09-30',
    });
    expect(renamedReport.rows).toContainEqual(expect.objectContaining({ salesperson: 'Renamed Rep', invoice_count: 2, sales: 200 }));
    expect(renamedReport.rows.filter((row: any) => row.salesperson_id === created.body.id)).toHaveLength(1);
    const retained = await SalesEngine.updateInvoice(organizationId, invoice.id, {
      notes: 'Non-attribution edit keeps original salesperson snapshot',
      editReason: 'Preserve invoice attribution',
    }, ownerId, '1');
    expect(retained.salespersonId).toBe(created.body.id);
    const retainedSnapshot = await db.query(
      'SELECT salesperson_name_snapshot, salesperson_code_snapshot, commission_rate_snapshot FROM invoices WHERE organization_id = $1 AND id = $2',
      [organizationId, invoice.id],
    );
    expect(retainedSnapshot.rows[0]).toMatchObject({ salesperson_name_snapshot: 'Snapshot Rep', salesperson_code_snapshot: `SNAP-${suffix}` });
    expect(Number(retainedSnapshot.rows[0].commission_rate_snapshot)).toBe(6.5);

    const replacement = await http.post('/api/v1/finance/salespersons').set(headers).send({
      code: `REASSIGN-${suffix}`, name: 'Replacement Snapshot Rep', commissionRate: 2.25,
    });
    expect(replacement.status).toBe(201);
    const reassigned = await SalesEngine.updateInvoice(organizationId, invoice.id, {
      salespersonId: replacement.body.id, editReason: 'Correct invoice attribution',
    }, ownerId, retained.editVersion!);
    expect(reassigned.salespersonId).toBe(replacement.body.id);
    const reassignedSnapshot = await db.query(
      'SELECT salesperson_id, salesperson_name_snapshot, salesperson_code_snapshot, commission_rate_snapshot FROM invoices WHERE organization_id = $1 AND id = $2',
      [organizationId, invoice.id],
    );
    expect(reassignedSnapshot.rows[0]).toMatchObject({
      salesperson_id: replacement.body.id, salesperson_name_snapshot: 'Replacement Snapshot Rep',
      salesperson_code_snapshot: `REASSIGN-${suffix}`,
    });
    expect(Number(reassignedSnapshot.rows[0].commission_rate_snapshot)).toBe(2.25);

    await SalesEngine.updateInvoice(organizationId, invoice.id, {
      salespersonId: null, editReason: 'Clear invoice attribution',
    }, ownerId, reassigned.editVersion!);
    const cleared = await db.query(
      'SELECT salesperson_id, salesperson_name_snapshot, salesperson_code_snapshot, commission_rate_snapshot FROM invoices WHERE organization_id = $1 AND id = $2',
      [organizationId, invoice.id],
    );
    expect(cleared.rows[0]).toMatchObject({
      salesperson_id: null, salesperson_name_snapshot: null, salesperson_code_snapshot: null,
      commission_rate_snapshot: null,
    });
    const unassignedReport = await ReportWorkspaceService.run(organizationId, 'sales_by_salesperson', {
      fromDate: '2026-09-01', toDate: '2026-09-30',
    });
    expect(unassignedReport.rows).toContainEqual(expect.objectContaining({ salesperson: 'Unassigned', invoice_count: 1, sales: 100 }));
  });

  it('enforces permissions and tenant isolation, audits writes, and serializes assignment against archive', async () => {
    const suffix = Date.now();
    const created = await http.post('/api/v1/finance/salespersons').set(headers).send({
      code: `BOUNDARY-${suffix}`, name: 'Boundary Rep', commissionRate: 0,
    });
    expect(created.status).toBe(201);

    const tenantB = MASTER_FIXTURE_CONSTANTS.ORG_B.id;
    const ownerB = MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_B.owner;
    const tokenB = JwtAuth.generateToken({ userId: ownerB.id, email: ownerB.email });
    const crossTenant = await http.patch(`/api/v1/finance/salespersons/${created.body.id}`)
      .set({ Authorization: `Bearer ${tokenB}`, 'x-organization-id': tenantB }).send({ name: 'Stolen Edit', updatedAt: created.body.updated_at });
    expect(crossTenant.status).toBe(404);

    const viewer = MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.viewer;
    const viewerToken = JwtAuth.generateToken({ userId: viewer.id, email: viewer.email });
    const denied = await http.post('/api/v1/finance/salespersons')
      .set({ Authorization: `Bearer ${viewerToken}`, 'x-organization-id': organizationId })
      .send({ code: `DENIED-${suffix}`, name: 'Viewer Cannot Create', commissionRate: 0 });
    expect(denied.status).toBe(403);

    const failedCode = `AUDIT-FAIL-${suffix}`;
    const auditFailure = vi.spyOn(FinanceController, 'logAudit').mockRejectedValueOnce(new Error('audit unavailable'));
    let failedCreate: any;
    try {
      failedCreate = await http.post('/api/v1/finance/salespersons').set(headers).send({
        code: failedCode, name: 'Must Roll Back', commissionRate: 0,
      });
    } finally {
      auditFailure.mockRestore();
    }
    expect(failedCreate!.status).toBe(500);
    const rolledBack = await db.query('SELECT id FROM salespersons WHERE organization_id = $1 AND code = $2', [organizationId, failedCode]);
    expect(rolledBack.rows).toHaveLength(0);
    const audit = await db.query(
      "SELECT id FROM audit_logs WHERE organization_id = $1 AND entity_type = 'Salesperson' AND entity_id = $2 AND action = 'SALESPERSON_CREATED'",
      [organizationId, created.body.id],
    );
    expect(audit.rows).toHaveLength(1);

    const raceRep = await http.post('/api/v1/finance/salespersons').set(headers).send({
      code: `RACE-${suffix}`, name: 'Race Rep', commissionRate: 0,
    });
    const raceCustomer = await http.post('/api/v1/finance/customers').set(headers).send({
      displayName: `Race Customer ${suffix}`, name: `Race Customer ${suffix}`,
    });
    expect(raceRep.status).toBe(201);
    expect(raceCustomer.status).toBe(201);
    const [assignment, archive] = await Promise.all([
      http.patch(`/api/v1/finance/customers/${raceCustomer.body.id}`).set(headers).send({ salespersonId: raceRep.body.id }),
      http.post(`/api/v1/finance/salespersons/${raceRep.body.id}/archive`).set(headers).send({}),
    ]);
    expect([200, 409]).toContain(assignment.status);
    expect([200, 409]).toContain(archive.status);
    const finalState = await db.query(
      `SELECT sp.status, c.salesperson_id FROM salespersons sp JOIN customers c ON c.organization_id = sp.organization_id
       WHERE sp.organization_id = $1 AND sp.id = $2 AND c.id = $3`,
      [organizationId, raceRep.body.id, raceCustomer.body.id],
    );
    expect(finalState.rows).toHaveLength(1);
    if (finalState.rows[0].status === 'INACTIVE') expect(finalState.rows[0].salesperson_id).toBeNull();
    else expect(finalState.rows[0].salesperson_id).toBe(raceRep.body.id);
  });});