import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/organizationIsolation.middleware';
import { AccessLifecycleError } from './MembershipContracts';
import { MembershipLifecycleService } from './MembershipLifecycleService';

export class MembershipController {
  public constructor(private readonly service = new MembershipLifecycleService()) {}

  public issueInvitation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await this.respond(res, async () => ({
      status: 201,
      body: await this.service.issueInvitation({
        actor: actorFrom(req),
        email: req.body?.email,
        role: req.body?.role,
        expiresInHours: req.body?.expiresInHours,
      }),
    }));
  };

  public issueAccountantAccess = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await this.respond(res, async () => ({
      status: 201,
      body: await this.service.issueAccountantInvitation({
        actor: actorFrom(req),
        email: req.body?.email,
        expiresInHours: req.body?.expiresInHours,
      }),
    }));
  };

  public listInvitations = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await this.respond(res, async () => ({ status: 200, body: await this.service.listInvitations(actorFrom(req)) }));
  };

  public listMembers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await this.respond(res, async () => ({ status: 200, body: await this.service.listMembers(actorFrom(req)) }));
  };

  public acceptInvitation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await this.respond(res, async () => {
      if (!req.user) throw new AccessLifecycleError('USER_INACTIVE', 'Authentication is required', 401);
      return {
        status: 201,
        body: await this.service.acceptInvitation({
          token: req.params.token,
          userId: req.user.userId,
          authenticatedEmail: req.user.email,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        }),
      };
    });
  };

  public revokeInvitation = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await this.respond(res, async () => ({
      status: 200,
      body: await this.service.revokeInvitation(actorFrom(req), req.params.invitationId),
    }));
  };

  public changeMembershipRole = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await this.respond(res, async () => ({
      status: 200,
      body: await this.service.changeMembershipRole(actorFrom(req), req.params.membershipId, req.body?.role),
    }));
  };

  public revokeMembership = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await this.respond(res, async () => ({
      status: 200,
      body: await this.service.revokeMembership(actorFrom(req), req.params.membershipId),
    }));
  };

  private async respond(
    res: Response,
    operation: () => Promise<{ status: number; body: unknown }>,
  ): Promise<void> {
    try {
      const result = await operation();
      res.status(result.status).json(result.body);
    } catch (error) {
      if (error instanceof AccessLifecycleError) {
        res.status(error.httpStatus).json({ error: error.message, code: error.code });
        return;
      }
      throw error;
    }
  }
}

function actorFrom(req: AuthenticatedRequest) {
  if (!req.auth) throw new AccessLifecycleError('ACTOR_MEMBERSHIP_INACTIVE', 'Organization authorization is required', 401);
  return {
    userId: req.auth.userId,
    organizationId: req.auth.organizationId,
    email: req.auth.email,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  };
}
