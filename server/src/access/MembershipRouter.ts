import { Router } from 'express';
import { authMiddleware, requirePermission } from '../middleware/organizationIsolation.middleware';
import { protectAsyncRoutes } from '../routes/asyncRouter';
import { MembershipController } from './MembershipController';

export function createMembershipManagementRouter(controller = new MembershipController()): Router {
  const router = Router();
  const canManageUsers = requirePermission('settings.manage_users');

  router.post('/invitations', canManageUsers, controller.issueInvitation);
  router.get('/invitations', canManageUsers, controller.listInvitations);
  router.get('/members', canManageUsers, controller.listMembers);
  router.delete('/invitations/:invitationId', canManageUsers, controller.revokeInvitation);
  router.post('/accountant-access', canManageUsers, controller.issueAccountantAccess);
  router.patch('/members/:membershipId/role', canManageUsers, controller.changeMembershipRole);
  router.delete('/members/:membershipId', canManageUsers, controller.revokeMembership);

  return protectAsyncRoutes(router);
}

export function createInvitationAcceptanceRouter(controller = new MembershipController()): Router {
  const router = Router();
  router.post('/invitations/:token/accept', authMiddleware, controller.acceptInvitation);
  return protectAsyncRoutes(router);
}
