import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

describe('v1 authoritative project accounting', () => {
  beforeAll(async () => MigrationRunner.runMigrations());

  async function tenant(label: string) {
    const registration = await request(app).post('/api/v1/auth/register').send({
      email: `${label}-${Date.now()}-${Math.random()}@example.com`,
      password: 'SecurePassword123!', fullName: 'Project Owner', organizationName: `${label} Firm`,
    });
    return {
      orgId: registration.body.organizationId,
      auth: { Authorization: `Bearer ${registration.body.token}` },
    };
  }

  async function projectFixture(label: string) {
    const context = await tenant(label);
    const client = await request(app).post('/api/v1/finance/clients').set(context.auth).send({ name: `${label} Client` });
    const project = await request(app).post('/api/v1/finance/projects').set(context.auth).send({
      code: `${label}-${Date.now()}`, name: `${label} Project`, clientId: client.body.id,
      budgetType: 'Fixed Cost', totalBudget: 1000, hourlyRate: 100,
    });
    return { ...context, client: client.body, project: project.body };
  }

  it('persists tenant-scoped time and derives summaries from authoritative records', async () => {
    const first = await projectFixture('project-summary');
    const second = await projectFixture('other-tenant');
    const time = await request(app).post('/api/v1/finance/time-entries').set(first.auth).send({
      projectId: first.project.id, staffName: 'Asha', taskName: 'Implementation', date: '2026-08-12',
      hours: 2.5, hourlyRate: 100, isBillable: true, description: 'Verified work',
    });
    expect(time.status).toBe(201);

    const otherTenantRead = await request(app).get('/api/v1/finance/time-entries').set(second.auth);
    expect(otherTenantRead.body).toEqual([]);
    const summary = await request(app).get('/api/v1/finance/project-summaries').set(first.auth);
    expect(summary.body.find((row: any) => row.projectId === first.project.id)).toMatchObject({
      totalLoggedHours: 2.5, unbilledHoursAmount: 250, directExpenses: 0,
    });
  });

  it('persists project expenses and includes only posted project costs in profitability', async () => {
    const fixture = await projectFixture('project-cost');
    const accounts = await db.query('SELECT id, code FROM accounts WHERE organization_id = $1', [fixture.orgId]);
    const expense = await request(app).post('/api/v1/finance/expenses').set(fixture.auth).send({
      expenseAccountId: accounts.rows.find((row) => row.code === '6000').id,
      paidFromAccountId: accounts.rows.find((row) => row.code === '1000').id,
      projectId: fixture.project.id, clientId: fixture.client.id,
      date: '2026-08-12', amount: 125.5, description: 'Project delivery cost',
    });
    expect(expense.status).toBe(201);
    const summary = await request(app).get('/api/v1/finance/project-summaries').set(fixture.auth);
    expect(summary.body.find((row: any) => row.projectId === fixture.project.id)).toMatchObject({
      directExpenses: 125.5, netProfit: -125.5, budgetUsedPercent: 12.6,
    });
  });

  it('atomically posts an invoice and seals all included time entries', async () => {
    const fixture = await projectFixture('time-invoice');
    for (const [taskName, hours] of [['Analysis', 1.5], ['Build', 2]] as const) {
      const response = await request(app).post('/api/v1/finance/time-entries').set(fixture.auth).send({
        projectId: fixture.project.id, staffName: 'Asha', taskName, date: '2026-08-12',
        hours, hourlyRate: 100, isBillable: true,
      });
      expect(response.status).toBe(201);
    }
    const invoiced = await request(app)
      .post(`/api/v1/finance/projects/${fixture.project.id}/invoice-unbilled-time`)
      .set(fixture.auth).send({ issueDate: '2026-08-12', dueDate: '2026-08-30' });
    expect(invoiced.status).toBe(201);
    expect(invoiced.body.totalAmount).toBe(350);

    const entries = await request(app).get('/api/v1/finance/time-entries').set(fixture.auth);
    expect(entries.body).toHaveLength(2);
    expect(entries.body.every((row: any) => row.isBilled && row.invoiceId === invoiced.body.id)).toBe(true);
    const edit = await request(app).put(`/api/v1/finance/time-entries/${entries.body[0].id}`).set(fixture.auth).send({ hours: 9 });
    expect(edit.status).toBe(422);
    expect(edit.body.error).toContain('Billed time is immutable');
    const duplicate = await request(app).post(`/api/v1/finance/projects/${fixture.project.id}/invoice-unbilled-time`).set(fixture.auth).send({ issueDate: '2026-08-12', dueDate: '2026-08-30' });
    expect(duplicate.status).toBe(409);
  });
});
