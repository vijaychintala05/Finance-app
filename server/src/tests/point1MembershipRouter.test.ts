import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { MembershipController } from '../access/MembershipController';
import { createMembershipManagementRouter } from '../access/MembershipRouter';

describe('Point-1 membership management router', () => {
  it('delegates the exact settings.manage_users decision to permission middleware', async () => {
    const controller = fakeController();
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.auth = {
        userId: 'usr-viewer', email: 'viewer@example.test', organizationId: 'org-a', role: 'Viewer', permissions: [],
      };
      next();
    });
    app.use('/access', createMembershipManagementRouter(controller.value));

    const response = await request(app).post('/access/invitations').send({
      email: 'accountant@example.test', role: 'Accountant',
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('settings.manage_users');
    expect(controller.handlers.issueInvitation).not.toHaveBeenCalled();
  });

  it('allows middleware-authorized requests to reach the controller', async () => {
    const controller = fakeController();
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.auth = {
        userId: 'usr-owner', email: 'owner@example.test', organizationId: 'org-a', role: 'Owner',
        permissions: ['settings.manage_users'],
      };
      next();
    });
    app.use('/access', createMembershipManagementRouter(controller.value));

    const response = await request(app).post('/access/accountant-access').send({ email: 'accountant@example.test' });

    expect(response.status).toBe(201);
    expect(controller.handlers.issueAccountantAccess).toHaveBeenCalledOnce();
  });
});

function fakeController() {
  const ok: RequestHandler = (_req, res) => { res.status(201).json({ ok: true }); };
  const handlers = {
    issueInvitation: vi.fn(ok),
    issueAccountantAccess: vi.fn(ok),
    listMembers: vi.fn(ok),
    listInvitations: vi.fn(ok),
    acceptInvitation: vi.fn(ok),
    revokeInvitation: vi.fn(ok),
    changeMembershipRole: vi.fn(ok),
    revokeMembership: vi.fn(ok),
  };
  return { handlers, value: handlers as unknown as MembershipController };
}
