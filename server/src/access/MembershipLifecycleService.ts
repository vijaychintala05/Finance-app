import crypto from 'node:crypto';
import { db, type DbQueryClient, type DbQueryResult } from '../database/db';
import { RbacService, type UserRole } from '../auth/RbacService';
import { newId } from '../utils/ids';
import {
  AccessLifecycleError,
  type AccessActor,
  type InvitationSummary,
  type InvitableRole,
  type IssuedInvitation,
  type MembershipMutationResult,
  type MembershipResult,
  type MembershipSummary,
  type SessionInvalidation,
} from './MembershipContracts';

export interface TransactionRunner {
  transaction<T>(callback: (client: DbQueryClient) => Promise<T>): Promise<T>;
}

export interface IssueInvitationInput {
  actor: AccessActor;
  email: string;
  role: InvitableRole;
  expiresInHours?: number;
}

export interface AcceptInvitationInput {
  token: string;
  userId: string;
  authenticatedEmail: string;
  ipAddress?: string;
  userAgent?: string;
}

interface MembershipRow {
  id: string;
  organization_id: string;
  user_id: string;
  role: UserRole;
  status: 'Active' | 'Revoked';
  access_version: number | string;
  access_invalidated_at?: string | Date | null;
}

interface InvitationRow {
  id: string;
  organization_id: string;
  email: string;
  role: InvitableRole;
  expires_at: string | Date;
  accepted_at: string | Date | null;
  accepted_by_user_id: string | null;
  revoked_at: string | Date | null;
  invited_by_user_id: string;
  created_at: string | Date;
}

const INVITABLE_ROLES = new Set<UserRole>(
  RbacService.getAllRoles().map(({ role }) => role).filter((role) => role !== 'Owner'),
);

export class MembershipLifecycleService {
  public constructor(
    private readonly database: TransactionRunner = db,
    private readonly now: () => Date = () => new Date(),
    private readonly randomBytes: (size: number) => Buffer = crypto.randomBytes,
  ) {}

  public async issueInvitation(input: IssueInvitationInput): Promise<IssuedInvitation> {
    const email = normalizeEmail(input.email);
    assertInvitableRole(input.role);
    const expiresInHours = input.expiresInHours ?? 72;
    if (!Number.isInteger(expiresInHours) || expiresInHours < 1 || expiresInHours > 24 * 30) {
      throw validationError('Invitation expiry must be between 1 hour and 30 days');
    }

    const token = this.randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const invitationId = newId('invitation');
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + expiresInHours * 60 * 60 * 1000);

    await this.database.transaction(async (client) => {
      await this.assertActiveActor(client, input.actor);

      const existingMember = await client.query(
        `SELECT om.id
         FROM organization_members om
         JOIN users u ON u.id = om.user_id
         WHERE om.organization_id = $1 AND LOWER(u.email) = $2 AND om.status = 'Active'
         LIMIT 1`,
        [input.actor.organizationId, email],
      );
      if (existingMember.rowCount > 0) {
        throw new AccessLifecycleError('MEMBERSHIP_ALREADY_EXISTS', 'This user is already an active member', 409);
      }

      const pending = await client.query(
        `SELECT id FROM organization_invitations
         WHERE organization_id = $1 AND email = $2
           AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > $3
         FOR UPDATE`,
        [input.actor.organizationId, email, createdAt.toISOString()],
      );
      if (pending.rowCount > 0) {
        throw new AccessLifecycleError('INVITATION_ALREADY_PENDING', 'A pending invitation already exists for this email', 409);
      }

      await client.query(
        `INSERT INTO organization_invitations
           (id, organization_id, email, role, token_hash, expires_at, invited_by_user_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          invitationId,
          input.actor.organizationId,
          email,
          input.role,
          tokenHash,
          expiresAt.toISOString(),
          input.actor.userId,
          createdAt.toISOString(),
        ],
      );
      await this.insertAudit(client, input.actor, 'ORGANIZATION_INVITATION_ISSUED', 'OrganizationInvitation', invitationId, null, {
        email,
        role: input.role,
        expiresAt: expiresAt.toISOString(),
      });
    });

    return {
      id: invitationId,
      organizationId: input.actor.organizationId,
      email,
      role: input.role,
      status: 'Pending',
      expiresAt: expiresAt.toISOString(),
      createdAt: createdAt.toISOString(),
      invitedByUserId: input.actor.userId,
      acceptedAt: null,
      acceptedByUserId: null,
      revokedAt: null,
      token,
    };
  }

  public async listMembers(actor: AccessActor): Promise<MembershipSummary[]> {
    return this.database.transaction(async (client) => {
      await this.assertActiveActor(client, actor);
      const result = await client.query(
        `SELECT om.id, om.organization_id, om.user_id, om.role, om.status,
                om.access_version, om.joined_at, u.email, u.full_name
           FROM organization_members om
           JOIN users u ON u.id = om.user_id
          WHERE om.organization_id = $1
          ORDER BY CASE WHEN om.role = 'Owner' THEN 0 ELSE 1 END, u.full_name, om.id`,
        [actor.organizationId]
      );
      return result.rows.map((row) => ({
        membershipId: row.id,
        organizationId: row.organization_id,
        userId: row.user_id,
        role: row.role,
        status: row.status,
        accessVersion: Number(row.access_version),
        email: row.email,
        fullName: row.full_name,
        joinedAt: new Date(row.joined_at).toISOString(),
      }));
    });
  }

  public async issueAccountantInvitation(input: Omit<IssueInvitationInput, 'role'>): Promise<IssuedInvitation> {
    return this.issueInvitation({ ...input, role: 'Accountant' });
  }

  public async listInvitations(actor: AccessActor): Promise<InvitationSummary[]> {
    return this.database.transaction(async (client) => {
      await this.assertActiveActor(client, actor);
      const result = await client.query<InvitationRow>(
        `SELECT id, organization_id, email, role, expires_at, accepted_at, accepted_by_user_id,
                revoked_at, invited_by_user_id, created_at
         FROM organization_invitations
         WHERE organization_id = $1
         ORDER BY created_at DESC, id DESC`,
        [actor.organizationId],
      );
      const currentTime = this.now().getTime();
      return result.rows.map((row) => invitationSummary(row, currentTime));
    });
  }

  public async acceptInvitation(input: AcceptInvitationInput): Promise<MembershipResult> {
    const token = typeof input.token === 'string' ? input.token.trim() : '';
    if (token.length < 32 || token.length > 256) throw validationError('Invitation token is invalid');
    const tokenHash = hashToken(token);
    const now = this.now();

    return this.database.transaction(async (client) => {
      const invitationResult = await client.query<InvitationRow>(
        `SELECT id, organization_id, email, role, expires_at, accepted_at, accepted_by_user_id,
                revoked_at, invited_by_user_id, created_at
         FROM organization_invitations
         WHERE token_hash = $1
         FOR UPDATE`,
        [tokenHash],
      );
      if (invitationResult.rowCount !== 1) {
        throw new AccessLifecycleError('INVITATION_NOT_FOUND', 'Invitation is invalid', 404);
      }
      const invitation = invitationResult.rows[0];
      if (invitation.accepted_at || invitation.revoked_at) {
        throw new AccessLifecycleError('INVITATION_NOT_PENDING', 'Invitation is no longer pending', 409);
      }
      if (new Date(invitation.expires_at).getTime() <= now.getTime()) {
        throw new AccessLifecycleError('INVITATION_EXPIRED', 'Invitation has expired', 410);
      }

      const userResult = await client.query<{ id: string; email: string; status: string }>(
        'SELECT id, email, status FROM users WHERE id = $1 FOR UPDATE',
        [input.userId],
      );
      if (userResult.rowCount !== 1 || userResult.rows[0].status !== 'Active') {
        throw new AccessLifecycleError('USER_INACTIVE', 'User account is unavailable or inactive', 403);
      }
      const databaseEmail = normalizeEmail(userResult.rows[0].email);
      if (databaseEmail !== normalizeEmail(input.authenticatedEmail) || databaseEmail !== normalizeEmail(invitation.email)) {
        throw new AccessLifecycleError('INVITATION_EMAIL_MISMATCH', 'Invitation email does not match the authenticated user', 403);
      }

      const existing = await client.query(
        `SELECT id FROM organization_members
         WHERE organization_id = $1 AND user_id = $2
         FOR UPDATE`,
        [invitation.organization_id, input.userId],
      );
      if (existing.rowCount > 0) {
        throw new AccessLifecycleError('MEMBERSHIP_ALREADY_EXISTS', 'A membership already exists for this organization', 409);
      }

      const membershipId = newId('mem');
      await client.query(
        `INSERT INTO organization_members
           (id, organization_id, user_id, role, status, access_version, joined_at)
         VALUES ($1, $2, $3, $4, 'Active', 1, $5)`,
        [membershipId, invitation.organization_id, input.userId, invitation.role, now.toISOString()],
      );
      const consumed = await client.query(
        `UPDATE organization_invitations
         SET accepted_at = $1, accepted_by_user_id = $2
         WHERE id = $3 AND accepted_at IS NULL AND revoked_at IS NULL`,
        [now.toISOString(), input.userId, invitation.id],
      );
      if (consumed.rowCount !== 1) {
        throw new AccessLifecycleError('ACCESS_CONFLICT', 'Invitation was changed concurrently', 409);
      }

      await this.insertAudit(
        client,
        {
          userId: input.userId,
          organizationId: invitation.organization_id,
          email: databaseEmail,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
        'ORGANIZATION_INVITATION_ACCEPTED',
        'OrganizationMembership',
        membershipId,
        null,
        { role: invitation.role, invitationId: invitation.id },
      );

      return {
        membershipId,
        organizationId: invitation.organization_id,
        userId: input.userId,
        role: invitation.role,
        status: 'Active',
        accessVersion: 1,
      };
    });
  }

  public async revokeInvitation(actor: AccessActor, invitationId: string): Promise<InvitationSummary> {
    assertId(invitationId, 'Invitation ID');
    const now = this.now();
    return this.database.transaction(async (client) => {
      await this.assertActiveActor(client, actor);
      const result = await client.query<InvitationRow>(
        `SELECT id, organization_id, email, role, expires_at, accepted_at, accepted_by_user_id,
                revoked_at, invited_by_user_id, created_at
         FROM organization_invitations
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [invitationId, actor.organizationId],
      );
      if (result.rowCount !== 1) {
        throw new AccessLifecycleError('INVITATION_NOT_FOUND', 'Invitation was not found', 404);
      }
      const invitation = result.rows[0];
      if (invitation.accepted_at || invitation.revoked_at) {
        throw new AccessLifecycleError('INVITATION_NOT_PENDING', 'Invitation is no longer pending', 409);
      }
      const updated = await client.query(
        `UPDATE organization_invitations
         SET revoked_at = $1, revoked_by_user_id = $2
         WHERE id = $3 AND organization_id = $4 AND accepted_at IS NULL AND revoked_at IS NULL`,
        [now.toISOString(), actor.userId, invitationId, actor.organizationId],
      );
      if (updated.rowCount !== 1) {
        throw new AccessLifecycleError('ACCESS_CONFLICT', 'Invitation was changed concurrently', 409);
      }
      await this.insertAudit(client, actor, 'ORGANIZATION_INVITATION_REVOKED', 'OrganizationInvitation', invitationId, {
        email: invitation.email,
        role: invitation.role,
      }, { revokedAt: now.toISOString() });
      return invitationSummary({ ...invitation, revoked_at: now }, now.getTime());
    });
  }

  public async changeMembershipRole(
    actor: AccessActor,
    membershipId: string,
    role: UserRole,
  ): Promise<MembershipMutationResult> {
    assertId(membershipId, 'Membership ID');
    assertRole(role);
    return this.mutateMembership(actor, membershipId, 'ROLE_CHANGED', async (client, membership, now) => {
      if (membership.role === role) throw validationError('Membership already has this role');
      if (membership.role === 'Owner' && role !== 'Owner') {
        await this.assertNotLastOwner(client, actor.organizationId, membership.id);
      }
      const update = await client.query<MembershipRow>(
        `UPDATE organization_members
         SET role = $1, access_version = access_version + 1, access_invalidated_at = $2
         WHERE id = $3 AND organization_id = $4 AND status = 'Active'
         RETURNING id, organization_id, user_id, role, status, access_version, access_invalidated_at`,
        [role, now, membership.id, actor.organizationId],
      );
      if (update.rowCount !== 1) throw new AccessLifecycleError('ACCESS_CONFLICT', 'Membership was changed concurrently', 409);
      return update.rows[0];
    });
  }

  public async revokeMembership(actor: AccessActor, membershipId: string): Promise<MembershipMutationResult> {
    assertId(membershipId, 'Membership ID');
    return this.mutateMembership(actor, membershipId, 'MEMBERSHIP_REVOKED', async (client, membership, now) => {
      if (membership.role === 'Owner') await this.assertNotLastOwner(client, actor.organizationId, membership.id);
      const update = await client.query<MembershipRow>(
        `UPDATE organization_members
         SET status = 'Revoked', revoked_at = $1, revoked_by_user_id = $2,
             access_version = access_version + 1, access_invalidated_at = $1
         WHERE id = $3 AND organization_id = $4 AND status = 'Active'
         RETURNING id, organization_id, user_id, role, status, access_version, access_invalidated_at`,
        [now, actor.userId, membership.id, actor.organizationId],
      );
      if (update.rowCount !== 1) throw new AccessLifecycleError('ACCESS_CONFLICT', 'Membership was changed concurrently', 409);
      return update.rows[0];
    });
  }

  private async mutateMembership(
    actor: AccessActor,
    membershipId: string,
    reason: SessionInvalidation['reason'],
    mutation: (client: DbQueryClient, membership: MembershipRow, now: string) => Promise<MembershipRow>,
  ): Promise<MembershipMutationResult> {
    return this.database.transaction(async (client) => {
      await this.assertActiveActor(client, actor);
      const targetResult = await client.query<MembershipRow>(
        `SELECT id, organization_id, user_id, role, status, access_version, access_invalidated_at
         FROM organization_members
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [membershipId, actor.organizationId],
      );
      if (targetResult.rowCount !== 1) throw new AccessLifecycleError('MEMBERSHIP_NOT_FOUND', 'Membership was not found', 404);
      const before = targetResult.rows[0];
      if (before.status !== 'Active') throw new AccessLifecycleError('MEMBERSHIP_INACTIVE', 'Membership is not active', 409);

      const invalidatedAt = this.now().toISOString();
      const after = await mutation(client, before, invalidatedAt);
      await client.query(
        'INSERT INTO revoked_tokens (id, user_id, revoked_at) VALUES ($1, $2, $3)',
        [newId('rev'), after.user_id, invalidatedAt],
      );
      await this.insertAudit(
        client,
        actor,
        reason === 'ROLE_CHANGED' ? 'ORGANIZATION_MEMBER_ROLE_CHANGED' : 'ORGANIZATION_MEMBER_REVOKED',
        'OrganizationMembership',
        after.id,
        { role: before.role, status: before.status, accessVersion: Number(before.access_version) },
        { role: after.role, status: after.status, accessVersion: Number(after.access_version) },
      );

      return {
        membershipId: after.id,
        organizationId: after.organization_id,
        userId: after.user_id,
        role: after.role,
        status: after.status,
        accessVersion: Number(after.access_version),
        sessionInvalidation: {
          userId: after.user_id,
          organizationId: after.organization_id,
          membershipId: after.id,
          accessVersion: Number(after.access_version),
          invalidatedAt,
          reason,
          compatibilityMode: 'GLOBAL_TOKEN_REVOCATION',
        },
      };
    });
  }

  private async assertActiveActor(client: DbQueryClient, actor: AccessActor): Promise<void> {
    const result = await client.query(
      `SELECT id FROM organization_members
       WHERE organization_id = $1 AND user_id = $2 AND status = 'Active'
       FOR UPDATE`,
      [actor.organizationId, actor.userId],
    );
    if (result.rowCount !== 1) {
      throw new AccessLifecycleError('ACTOR_MEMBERSHIP_INACTIVE', 'Acting membership is unavailable or inactive', 403);
    }
  }

  private async assertNotLastOwner(client: DbQueryClient, organizationId: string, excludedMembershipId: string): Promise<void> {
    const result = await client.query<{ count: string | number }>(
      `SELECT COUNT(*) AS count
       FROM organization_members
       WHERE organization_id = $1 AND role = 'Owner' AND status = 'Active' AND id <> $2`,
      [organizationId, excludedMembershipId],
    );
    if (Number(result.rows[0]?.count || 0) < 1) {
      throw new AccessLifecycleError('LAST_OWNER_PROTECTED', 'The last active owner cannot be changed or revoked', 409);
    }
  }

  private async insertAudit(
    client: DbQueryClient,
    actor: AccessActor,
    action: string,
    entityType: string,
    entityId: string,
    beforeState: unknown,
    afterState: unknown,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_logs
         (id, organization_id, user_id, action, entity_type, entity_id, timestamp, before_state, after_state, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        newId('aud'),
        actor.organizationId,
        actor.userId,
        action,
        entityType,
        entityId,
        this.now().toISOString(),
        beforeState == null ? null : JSON.stringify(beforeState),
        afterState == null ? null : JSON.stringify(afterState),
        JSON.stringify({ ipAddress: actor.ipAddress || null, userAgent: actor.userAgent || null }),
      ],
    );
  }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function normalizeEmail(value: string): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw validationError('A valid email address is required');
  }
  return email;
}

function assertInvitableRole(role: string): asserts role is InvitableRole {
  if (!INVITABLE_ROLES.has(role as UserRole)) throw validationError('A valid non-owner role is required');
}

function assertRole(role: string): asserts role is UserRole {
  if (!RbacService.getAllRoles().some((entry) => entry.role === role)) throw validationError('A valid role is required');
}

function assertId(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length < 3 || value.length > 128) throw validationError(`${label} is invalid`);
}

function validationError(message: string): AccessLifecycleError {
  return new AccessLifecycleError('ACCESS_VALIDATION_FAILED', message, 400);
}

function invitationSummary(row: InvitationRow, currentTime: number): InvitationSummary {
  const status: InvitationSummary['status'] = row.accepted_at
    ? 'Accepted'
    : row.revoked_at
      ? 'Revoked'
      : new Date(row.expires_at).getTime() <= currentTime
        ? 'Expired'
        : 'Pending';
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    role: row.role,
    status,
    expiresAt: new Date(row.expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    invitedByUserId: row.invited_by_user_id,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at).toISOString() : null,
    acceptedByUserId: row.accepted_by_user_id,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
  };
}
