import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

describe('Point-1 team access API lifecycle', () => {
  beforeAll(async () => {
    delete process.env.TRUSTED_FINANCE_FEATURES;
    db.initPgMem();
    await MigrationRunner.runMigrations();
  });

  it('invites, accepts, changes role, and revokes access with immediate enforcement', async () => {
    const owner = await request(app).post('/api/v1/auth/register').send({
      email: `access-owner-${Date.now()}@example.test`, password: 'SecurePassword123!',
      fullName: 'Access Owner', organizationName: 'Access Firm',
    });
    const invitee = await request(app).post('/api/v1/auth/register').send({
      email: `access-accountant-${Date.now()}@example.test`, password: 'SecurePassword123!',
      fullName: 'External Accountant', organizationName: 'Accountant Personal Org',
    });
    const ownerAuth = { Authorization: `Bearer ${owner.body.token}`, 'X-Organization-ID': owner.body.organizationId };
    const inviteeAuth = { Authorization: `Bearer ${invitee.body.token}` };

    const issued = await request(app).post('/api/v1/access/accountant-access')
      .set(ownerAuth).set('Idempotency-Key', `invite-${Date.now()}`)
      .send({ email: invitee.body.user.email });
    expect(issued.status).toBe(201);
    expect(issued.body.token).toBeTruthy();

    const accepted = await request(app)
      .post(`/api/v1/access/invitations/${issued.body.token}/accept`)
      .set(inviteeAuth);
    expect(accepted.status).toBe(201);
    expect(accepted.body).toMatchObject({ role: 'Accountant', status: 'Active' });

    const members = await request(app).get('/api/v1/access/members').set(ownerAuth);
    expect(members.status).toBe(200);
    const accountant = members.body.find((member: any) => member.userId === invitee.body.user.id);
    expect(accountant).toMatchObject({ email: invitee.body.user.email, role: 'Accountant' });

    const changed = await request(app)
      .patch(`/api/v1/access/members/${accountant.membershipId}/role`)
      .set(ownerAuth).set('Idempotency-Key', `role-${Date.now()}`)
      .send({ role: 'Viewer' });
    expect(changed.status).toBe(200);
    expect(changed.body.role).toBe('Viewer');

    const revoked = await request(app)
      .delete(`/api/v1/access/members/${accountant.membershipId}`)
      .set(ownerAuth).set('Idempotency-Key', `revoke-${Date.now()}`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.status).toBe('Revoked');

    const denied = await request(app).get('/api/v1/finance/accounts')
      .set({ Authorization: `Bearer ${invitee.body.token}`, 'X-Organization-ID': owner.body.organizationId });
    expect(denied.status).toBe(401);
  });
});
