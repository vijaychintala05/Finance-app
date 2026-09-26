import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { IdentityInviteService } from '../auth/IdentityInviteService';
import { JwtAuth } from '../auth/jwt';
import { SessionService } from '../auth/SessionService';
import { EmailOutboxService } from '../services/EmailOutboxService';

describe('Identity invite session revocation', () => {
  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    db.initPgMem();
    await MigrationRunner.runMigrations();
    EmailOutboxService.setCustomSender(null);
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id, status)
       VALUES ('org_invite_sessions', 'org-invite-sessions', 'ORG-INV-SESS', 'OIS', 'Invite Session Org', 'US', 'USD', '$', 'usr_invite_owner', 'Active')`
    );
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ('usr_invite_owner', 'owner@invite-sessions.local', 'old-hash', 'Owner', 'Active')`
    );
    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role)
       VALUES ('mem_invite_owner', 'org_invite_sessions', 'usr_invite_owner', 'Owner')`
    );
  });

  it('revokes prior JWT and opaque sessions and preserves the new invite session', async () => {
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ('usr_existing_invitee', 'existing@firmbooks.local', 'old-hash', 'Existing User', 'Active')`
    );
    const invite = await IdentityInviteService.issueInvitation('org_invite_sessions', 'usr_invite_owner', 'existing@firmbooks.local', 'Staff');
    const priorSession = await SessionService.createSession('usr_existing_invitee');
    const priorJwt = JwtAuth.generateToken({ userId: 'usr_existing_invitee', email: 'existing@firmbooks.local', sid: priorSession.sessionId });

    const accepted = await IdentityInviteService.acceptInvitation(invite.rawToken, 'ReplacementPass123!', 'Updated User');

    expect(JwtAuth.verifyToken(priorJwt)?.sid).toBe(priorSession.sessionId);
    const rejectedJwt = await request(app).get('/api/v1/identity/sessions').set('Authorization', `Bearer ${priorJwt}`);
    const rejectedOpaque = await request(app).get('/api/v1/identity/sessions').set('Authorization', `Bearer ${priorSession.sessionToken}`);
    const currentJwt = JwtAuth.generateToken({ userId: accepted.userId, email: accepted.email, sid: accepted.sessionId });
    const acceptedJwt = await request(app).get('/api/v1/identity/sessions').set('Authorization', `Bearer ${currentJwt}`);
    const acceptedOpaque = await request(app).get('/api/v1/identity/sessions').set('Authorization', `Bearer ${accepted.sessionToken}`);

    expect(rejectedJwt.status).toBe(401);
    expect(rejectedOpaque.status).toBe(401);
    expect(acceptedJwt.status).toBe(200);
    expect(acceptedOpaque.status).toBe(200);
  });

  it('rolls back revoked sessions, credentials, and invitation consumption when session creation fails', async () => {
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ('usr_rollback_invitee', 'rollback@firmbooks.local', 'old-hash', 'Existing User', 'Active')`
    );
    const invite = await IdentityInviteService.issueInvitation('org_invite_sessions', 'usr_invite_owner', 'rollback@firmbooks.local', 'Staff');
    const priorSession = await SessionService.createSession('usr_rollback_invitee');
    const createSession = vi.spyOn(SessionService, 'createSession').mockRejectedValueOnce(new Error('session creation failed'));

    try {
      await expect(
        IdentityInviteService.acceptInvitation(invite.rawToken, 'ReplacementPass123!', 'Updated User')
      ).rejects.toThrow('session creation failed');
    } finally {
      createSession.mockRestore();
    }

    expect((await SessionService.validateSession(priorSession.sessionToken)).isValid).toBe(true);
    expect(await SessionService.validateJwtSession(priorSession.sessionId, 'usr_rollback_invitee')).toBe(true);
    const user = await db.query("SELECT password_hash, full_name FROM users WHERE id = 'usr_rollback_invitee'");
    expect(user.rows[0]).toMatchObject({ password_hash: 'old-hash', full_name: 'Existing User' });
    const invitation = await db.query('SELECT accepted_at FROM organization_invitations WHERE id = $1', [invite.invitationId]);
    expect(invitation.rows[0].accepted_at).toBeNull();
  });
});