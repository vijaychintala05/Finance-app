import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { IdentityInviteService } from '../auth/IdentityInviteService';
import { PasswordRecoveryService } from '../auth/PasswordRecoveryService';
import { GoogleOAuthService } from '../auth/GoogleOAuthService';
import { EmailOutboxService } from '../services/EmailOutboxService';
import { SessionService } from '../auth/SessionService';

describe('Identity Invitations, Recovery, Outbox & OAuth Verification', () => {
  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    db.initPgMem();
    await MigrationRunner.runMigrations();
    EmailOutboxService.setCustomSender(null);

    // Seed test organization
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id, status)
       VALUES ('org_test_1', 'org-uuid-1', 'ORG-PUB-1', 'ORG01', 'FirmBooks Core Org', 'US', 'USD', '$', 'usr_owner_1', 'Active')`
    );

    // Seed test owner user
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ('usr_owner_1', 'owner@firmbooks.local', 'mockhash', 'Firm Owner', 'Active')`
    );

    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role)
       VALUES ('mem_1', 'org_test_1', 'usr_owner_1', 'Owner')`
    );
  });

  describe('Bootstrap Signup Lock', () => {
    it('disallows public bootstrap once an active owner user exists', async () => {
      const allowed = await IdentityInviteService.isBootstrapAllowed();
      expect(allowed).toBe(false);
    });

    it('allows bootstrap when 0 active users exist', async () => {
      await db.query(`DELETE FROM users`);
      const allowed = await IdentityInviteService.isBootstrapAllowed();
      expect(allowed).toBe(true);
    });
  });

  describe('Invite-Only Workforce Access Flow', () => {
    it('issues single-use invitations, enqueues transactional outbox email, and accepts invitation', async () => {
      const invite = await IdentityInviteService.issueInvitation(
        'org_test_1',
        'usr_owner_1',
        'auditor@financefirm.com',
        'Accountant'
      );

      expect(invite.invitationId).toBeDefined();
      expect(invite.rawToken).toHaveLength(64);

      // Verify email was enqueued into outbox
      const outbox = await EmailOutboxService.listOutbox(undefined, 10);
      expect(outbox.length).toBeGreaterThanOrEqual(1);
      const inviteEmail = outbox.find((e) => e.recipientEmail === 'auditor@financefirm.com');
      expect(inviteEmail).toBeDefined();
      expect(inviteEmail?.templateType).toBe('INVITATION');
      expect(inviteEmail?.payload.role).toBe('Accountant');

      // Accept invitation
      const accepted = await IdentityInviteService.acceptInvitation(
        invite.rawToken,
        'SecurePassword123!',
        'Senior Auditor'
      );

      expect(accepted.email).toBe('auditor@financefirm.com');
      expect(accepted.organizationId).toBe('org_test_1');
      expect(accepted.role).toBe('Accountant');
      expect(accepted.sessionToken).toHaveLength(64);

      // Verify user identity record is now ACTIVE
      const idenRes = await db.query(
        `SELECT account_state FROM user_identities WHERE user_id = $1`,
        [accepted.userId]
      );
      expect(idenRes.rows[0].account_state).toBe('ACTIVE');

      // Re-accepting the same token must fail (single-use)
      await expect(
        IdentityInviteService.acceptInvitation(invite.rawToken, 'AnotherPass!', 'Hacker')
      ).rejects.toThrow(/ALREADY_USED/);
    });

    it('allows owner to revoke or resend invitations', async () => {
      const invite = await IdentityInviteService.issueInvitation(
        'org_test_1',
        'usr_owner_1',
        'temp@firmbooks.local',
        'Staff'
      );

      const resent = await IdentityInviteService.resendInvitation(invite.invitationId, 'usr_owner_1');
      expect(resent.rawToken).not.toBe(invite.rawToken);

      const revoked = await IdentityInviteService.revokeInvitation(invite.invitationId, 'usr_owner_1');
      expect(revoked).toBe(true);

      // Attempting to accept revoked invitation must fail
      await expect(
        IdentityInviteService.acceptInvitation(resent.rawToken, 'Password123!', 'Temp Staff')
      ).rejects.toThrow(/REVOKED/);
    });
  });

  describe('Password Recovery & Global Sign-Out', () => {
    it('returns generic response for unknown emails and validly resets password with global session invalidation', async () => {
      // 1. Anti-enumeration check
      const unknownRes = await PasswordRecoveryService.requestPasswordReset('nonexistent@nowhere.com');
      expect(unknownRes.message).toContain('If an account exists');

      // 2. Active owner request
      await PasswordRecoveryService.requestPasswordReset('owner@firmbooks.local');
      const outbox = await EmailOutboxService.listOutbox(undefined, 10);
      const resetEmail = outbox.find((e) => e.recipientEmail === 'owner@firmbooks.local' && e.templateType === 'PASSWORD_RESET');
      expect(resetEmail).toBeDefined();

      const resetLink = resetEmail?.payload.resetLink as string;
      const rawToken = resetLink.split('token=')[1];

      // Create active session for owner before reset
      const ownerSession = await SessionService.createSession('usr_owner_1');
      expect((await SessionService.validateSession(ownerSession.sessionToken)).isValid).toBe(true);

      // Complete reset
      const completed = await PasswordRecoveryService.completePasswordReset(rawToken, 'NewSecurePass2026!');
      expect(completed.success).toBe(true);
      expect(completed.message).toContain('All existing sessions have been signed out');

      // Verify previous session is invalidated (Global Sign-Out)
      const sessionCheck = await SessionService.validateSession(ownerSession.sessionToken);
      expect(sessionCheck.isValid).toBe(false);

      // Replay reset token must fail
      await expect(
        PasswordRecoveryService.completePasswordReset(rawToken, 'AnotherPass999!')
      ).rejects.toThrow(/INVALID_OR_EXPIRED_RESET_TOKEN/);
    });

    it('enforces uniform enterprise password policy during password reset', async () => {
      await PasswordRecoveryService.requestPasswordReset('owner@firmbooks.local');
      const resetRow = await db.query(
        `SELECT payload FROM outbox_emails WHERE template_type = 'PASSWORD_RESET' ORDER BY created_at DESC LIMIT 1`
      );
      const payload = typeof resetRow.rows[0].payload === 'string' ? JSON.parse(resetRow.rows[0].payload) : resetRow.rows[0].payload;
      const rawToken = (payload.resetLink as string).split('token=')[1];

      // Weak password (< 12 chars) -> rejected
      await expect(
        PasswordRecoveryService.completePasswordReset(rawToken, 'Short1!')
      ).rejects.toThrow(/Password must be at least 8 characters; the current security policy requires 12/);

      // Weak password (no symbols) -> rejected
      await expect(
        PasswordRecoveryService.completePasswordReset(rawToken, 'NoSymbolsPass1234')
      ).rejects.toThrow(/Password must include upper-case, lower-case, number, and symbol characters/);
    });

    it('atomically claims reset tokens so concurrent race attempts only allow 1 success', async () => {
      await PasswordRecoveryService.requestPasswordReset('owner@firmbooks.local');
      const resetRow = await db.query(
        `SELECT payload FROM outbox_emails WHERE template_type = 'PASSWORD_RESET' ORDER BY created_at DESC LIMIT 1`
      );
      const payload = typeof resetRow.rows[0].payload === 'string' ? JSON.parse(resetRow.rows[0].payload) : resetRow.rows[0].payload;
      const rawToken = (payload.resetLink as string).split('token=')[1];

      // Execute 2 concurrent reset attempts
      const [res1, res2] = await Promise.allSettled([
        PasswordRecoveryService.completePasswordReset(rawToken, 'RaceWinnerPass1!'),
        PasswordRecoveryService.completePasswordReset(rawToken, 'RaceWinnerPass2!'),
      ]);

      const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
      const rejected = [res1, res2].filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    });
  });

  describe('Google OAuth Strict Identity Linking', () => {
    it('rejects Google authentication for emails not invited to FirmBooks', async () => {
      await expect(
        GoogleOAuthService.authenticateGoogleUser('google_sub_999', 'stranger@gmail.com')
      ).rejects.toThrow(/UNAUTHORIZED_GOOGLE_IDENTITY/);
    });

    it('links Google identity strictly to existing active invited FirmBooks user', async () => {
      const authResult = await GoogleOAuthService.authenticateGoogleUser(
        'google_sub_1001',
        'owner@firmbooks.local'
      );

      expect(authResult.userId).toBe('usr_owner_1');
      expect(authResult.sessionToken).toHaveLength(64);

      // Verify link in external_identity_links
      const linkRes = await db.query(
        `SELECT * FROM external_identity_links WHERE provider_subject = 'google_sub_1001'`
      );
      expect(linkRes.rows.length).toBe(1);
      expect(linkRes.rows[0].user_id).toBe('usr_owner_1');
    });
  });

  describe('Email Outbox Dispatch & Exponential Backoff', () => {
    it('retries failed dispatches with backoff and marks sent on success', async () => {
      let attemptCount = 0;
      EmailOutboxService.setCustomSender(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          return { success: false, error: 'SMTP Timeout 504' };
        }
        return { success: true };
      });

      const emailId = await EmailOutboxService.enqueueEmail('alert@financefirm.com', 'SECURITY_ALERT', {
        event: 'NEW_DEVICE_LOGIN',
      });

      // 1st dispatch attempt -> fails, sets RETRYING
      const res1 = await EmailOutboxService.processOutbox(10);
      expect(res1.failed).toBe(1);

      const check1 = await db.query(`SELECT delivery_status, retry_count FROM outbox_emails WHERE id = $1`, [emailId]);
      expect(check1.rows[0].delivery_status).toBe('RETRYING');
      expect(check1.rows[0].retry_count).toBe(1);

      // Force next_retry_at to past so it's eligible for 2nd attempt
      await db.query(`UPDATE outbox_emails SET next_retry_at = '2020-01-01T00:00:00.000Z' WHERE id = $1`, [emailId]);

      // 2nd dispatch attempt -> succeeds, sets SENT
      const res2 = await EmailOutboxService.processOutbox(10);
      expect(res2.successful).toBe(1);

      const check2 = await db.query(`SELECT delivery_status, sent_at FROM outbox_emails WHERE id = $1`, [emailId]);
      expect(check2.rows[0].delivery_status).toBe('SENT');
      expect(check2.rows[0].sent_at).toBeDefined();
    });
  });
});
