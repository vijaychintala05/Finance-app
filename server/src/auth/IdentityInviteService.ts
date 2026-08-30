import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../database/db';
import { newId } from '../utils/ids';
import { EmailOutboxService } from '../services/EmailOutboxService';
import { SessionService } from './SessionService';

export class IdentityInviteService {
  private static INVITE_TTL_DAYS = 7;

  public static hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  public static generateRawToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  public static async isBootstrapAllowed(): Promise<boolean> {
    const res = await db.query(`SELECT COUNT(*) as count FROM users WHERE status = 'Active'`);
    const count = Number(res.rows[0]?.count || 0);
    return count === 0;
  }

  public static async issueInvitation(
    orgId: string,
    inviterUserId: string,
    email: string,
    role: string = 'Staff'
  ): Promise<{ invitationId: string; rawToken: string; expiresAt: string }> {
    const cleanEmail = email.toLowerCase().trim();

    // Check if user is already an active member of this organization
    const existingUser = await db.query(
      `SELECT u.id, m.role
       FROM users u
       JOIN organization_members m ON u.id = m.user_id
       WHERE u.email = $1 AND m.organization_id = $2`,
      [cleanEmail, orgId]
    );

    if (existingUser.rows.length > 0) {
      throw new Error('USER_ALREADY_MEMBER: This email is already an active member of this organization.');
    }

    const inviteId = newId('inv');
    const rawToken = IdentityInviteService.generateRawToken();
    const tokenHash = IdentityInviteService.hashToken(rawToken);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + IdentityInviteService.INVITE_TTL_DAYS * 86400000).toISOString();

    // Begin transactional write: invitation + outbox + identity record
    await db.query(
      `INSERT INTO organization_invitations (id, organization_id, email, role, token_hash, invited_by_user_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [inviteId, orgId, cleanEmail, role, tokenHash, inviterUserId, expiresAt]
    );

    // Ensure user_identities record exists in INVITED state
    const userIdPlaceholder = newId('usr');
    await db.query(
      `INSERT INTO user_identities (id, user_id, email, account_state)
       VALUES ($1, $2, $3, 'INVITED')
       ON CONFLICT (email) DO NOTHING`,
      [newId('iden'), userIdPlaceholder, cleanEmail]
    );

    // Enqueue invitation email transactionally
    await EmailOutboxService.enqueueEmail(
      cleanEmail,
      'INVITATION',
      {
        inviteId,
        organizationId: orgId,
        role,
        inviteLink: `/#/accept-invite?token=${rawToken}`,
        expiresAt,
      },
      orgId
    );

    await db.query(
      `INSERT INTO security_events (id, organization_id, user_id, event_type, metadata)
       VALUES ($1, $2, $3, 'INVITATION_ISSUED', $4)`,
      [newId('sec'), orgId, inviterUserId, JSON.stringify({ email: cleanEmail, role, inviteId })]
    );

    return { invitationId: inviteId, rawToken, expiresAt };
  }

  public static async resendInvitation(
    inviteId: string,
    inviterUserId: string
  ): Promise<{ rawToken: string; expiresAt: string }> {
    const res = await db.query(
      `SELECT id, organization_id, email, role, accepted_at, revoked_at
       FROM organization_invitations
       WHERE id = $1`,
      [inviteId]
    );

    if (res.rows.length === 0) {
      throw new Error('INVITATION_NOT_FOUND: Invitation does not exist.');
    }

    const row = res.rows[0];
    if (row.accepted_at) {
      throw new Error('INVITATION_ALREADY_ACCEPTED: Invitation has already been accepted.');
    }
    if (row.revoked_at) {
      throw new Error('INVITATION_REVOKED: Invitation was revoked.');
    }

    const rawToken = IdentityInviteService.generateRawToken();
    const tokenHash = IdentityInviteService.hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + IdentityInviteService.INVITE_TTL_DAYS * 86400000).toISOString();

    await db.query(
      `UPDATE organization_invitations
       SET token_hash = $1, expires_at = $2
       WHERE id = $3`,
      [tokenHash, expiresAt, inviteId]
    );

    await EmailOutboxService.enqueueEmail(
      row.email,
      'INVITATION',
      {
        inviteId,
        organizationId: row.organization_id,
        role: row.role,
        inviteLink: `/#/accept-invite?token=${rawToken}`,
        expiresAt,
      },
      row.organization_id
    );

    return { rawToken, expiresAt };
  }

  public static async revokeInvitation(inviteId: string, revokerUserId: string): Promise<boolean> {
    const res = await db.query(
      `UPDATE organization_invitations
       SET revoked_at = CURRENT_TIMESTAMP, revoked_by_user_id = $1
       WHERE id = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
      [revokerUserId, inviteId]
    );
    return (res.rowCount || 0) > 0;
  }

  public static async acceptInvitation(
    rawToken: string,
    password: string,
    fullName: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<{ userId: string; email: string; organizationId: string; role: string; sessionToken: string; sessionId: string }> {
    const tokenHash = IdentityInviteService.hashToken(rawToken);
    const res = await db.query(
      `SELECT id, organization_id, email, role, expires_at, accepted_at, revoked_at
       FROM organization_invitations
       WHERE token_hash = $1`,
      [tokenHash]
    );

    if (res.rows.length === 0) {
      throw new Error('INVALID_INVITATION_TOKEN: The invitation link is invalid.');
    }

    const invite = res.rows[0];
    const now = new Date();
    if (invite.accepted_at) {
      throw new Error('INVITATION_ALREADY_USED: This invitation has already been accepted.');
    }
    if (invite.revoked_at) {
      throw new Error('INVITATION_REVOKED: This invitation was revoked by the organization owner.');
    }
    if (new Date(invite.expires_at) <= now) {
      throw new Error('INVITATION_EXPIRED: This invitation has expired.');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Check if user record already exists
    const userLookup = await db.query(`SELECT id FROM users WHERE email = $1`, [invite.email]);
    let userId: string;

    if (userLookup.rows.length > 0) {
      userId = userLookup.rows[0].id;
      await db.query(`UPDATE users SET password_hash = $1, full_name = $2 WHERE id = $3`, [passwordHash, fullName, userId]);
    } else {
      userId = newId('usr');
      await db.query(
        `INSERT INTO users (id, email, password_hash, full_name, status)
         VALUES ($1, $2, $3, $4, 'Active')`,
        [userId, invite.email, passwordHash, fullName]
      );
    }

    // Upsert organization member
    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [newId('mem'), invite.organization_id, userId, invite.role]
    );

    // Update user_identities to ACTIVE and EMAIL_VERIFIED
    await db.query(
      `INSERT INTO user_identities (id, user_id, email, password_hash, account_state, email_verified_at, last_login_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           password_hash = EXCLUDED.password_hash,
           account_state = 'ACTIVE',
           email_verified_at = CURRENT_TIMESTAMP,
           last_login_at = CURRENT_TIMESTAMP`,
      [newId('iden'), userId, invite.email, passwordHash]
    );

    // Mark invitation accepted
    await db.query(
      `UPDATE organization_invitations SET accepted_at = CURRENT_TIMESTAMP, accepted_by_user_id = $1 WHERE id = $2`,
      [userId, invite.id]
    );

    // Issue opaque session token
    const session = await SessionService.createSession(userId, metadata);

    return {
      userId,
      email: invite.email,
      organizationId: invite.organization_id,
      role: invite.role,
      sessionId: session.sessionId,
      sessionToken: session.sessionToken,
    };
  }
}
