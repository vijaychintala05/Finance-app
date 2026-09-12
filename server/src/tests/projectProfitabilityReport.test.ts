import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { MigrationRunner } from '../database/migrationRunner';
import { ProjectReportingService } from '../services/ProjectReportingService';

describe('Project Profitability Report Group By & Financial Query Validation', () => {
  beforeAll(async () => MigrationRunner.runMigrations());

  async function setupTenant(label: string) {
    const reg = await request(app).post('/api/v1/auth/register').send({
      email: `${label}-${Date.now()}@example.com`,
      password: 'SecurePassword123!',
      fullName: 'Project Tester',
      organizationName: `${label} Org`,
    });
    const auth = { Authorization: `Bearer ${reg.body.token}` };
    const orgId = reg.body.organizationId;
    return { auth, orgId, user: reg.body.user };
  }

  it('generates project profitability report without PostgreSQL GROUP BY column errors', async () => {
    const { auth, orgId } = await setupTenant('proj-profit-test');

    // 1. Create a project
    const projRes = await request(app).post('/api/v1/finance/projects').set(auth).send({
      name: 'Alpha Redesign Project',
      code: 'PRJ-ALPHA',
      status: 'Active',
      budget: 50000,
    });
    expect(projRes.status).toBe(201);
    const projectId = projRes.body.id;

    // 2. Fetch project profitability report via API endpoint
    const reportRes = await request(app)
      .get('/api/v1/finance/reports/project-profitability')
      .query({ fromDate: '2026-01-01', toDate: '2026-12-31' })
      .set(auth);

    expect(reportRes.status).toBe(200);
    expect(reportRes.body.projects).toBeDefined();
    expect(reportRes.body.projects.length).toBeGreaterThanOrEqual(1);

    const alphaProject = reportRes.body.projects.find((p: any) => p.projectId === projectId);
    expect(alphaProject).toBeDefined();
    expect(alphaProject.projectName).toBe('Alpha Redesign Project');

    // 3. Directly call ProjectReportingService.getProfitabilityReport
    const directReport = await ProjectReportingService.getProfitabilityReport(orgId, {
      fromDate: '2026-01-01',
      toDate: '2026-12-31',
      projectId,
    });
    expect(directReport.projects.length).toBe(1);
    expect(directReport.projects[0].projectId).toBe(projectId);
    expect(directReport.totals.revenue).toBe(0);
    expect(directReport.totals.directCosts).toBe(0);
  });
});
