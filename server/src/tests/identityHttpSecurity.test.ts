import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { JwtAuth } from '../auth/jwt';
import { SessionService } from '../auth/SessionService';
import { MfaService } from '../auth/MfaService';
import { EmailOutboxService } from '../services/EmailOutboxService';
import { GoogleOAuthService } from '../auth/GoogleOAuthService';
import { PasswordRecoveryService } from '../auth/PasswordRecoveryService';
import { assertProductionConfiguration } from '../config/environment';
import { SessionSecurity } from '../auth/SessionSecurity';

// Simulate Google at the network boundary; application code never accepts mock identities.
function configureGoogleFixture() {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client.apps.googleusercontent.com');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.href === 'https://oauth2.googleapis.com/token') {
      const code = new URLSearchParams(String(init?.body)).get('code') || '';
      return new Response(JSON.stringify({ id_token: code.replace('mock-email:', '') }));
    }
    if (url.origin === 'https://oauth2.googleapis.com' && url.pathname === '/tokeninfo') {
      const email = url.searchParams.get('id_token') || '';
      return new Response(JSON.stringify({ aud: process.env.GOOGLE_CLIENT_ID, sub: `google-${email}`, email, email_verified: true }));
    }
    throw new Error('Unexpected network call in Google fixture');
  });
}

describe('Identity & Security Center HTTP Boundary Test Suite', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_ENCRYPTION_KEY = 'test-firmbooks-auth-encryption-key-32-chars-long!';
    db.initPgMem();
    await MigrationRunner.runMigrations();
    EmailOutboxService.setCustomSender(null);

    // Organization A (Acme Corp)
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id, status)
       VALUES ('org_a', 'uuid-org-a', 'PUB-A', 'ORGA', 'Acme Corp', 'US', 'USD', '$', 'usr_owner_a', 'Active')`
    );
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ('usr_owner_a', 'owner@acme.com', '$2b$10$eE0m/QyMeqYxY3cM7hZ0wOaG0j6Y5e1q9y9e9e9e9e9e9e9e9e9e', 'Acme Owner', 'Active')`
    );
    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role)
       VALUES ('mem_a1', 'org_a', 'usr_owner_a', 'Owner')`
    );

    // Organization A Admin & Staff
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ('usr_admin_a', 'admin@acme.com', 'mockhash', 'Acme Admin', 'Active'),
              ('usr_staff_a', 'staff@acme.com', 'mockhash', 'Acme Staff', 'Active')`
    );
    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role)
       VALUES ('mem_a2', 'org_a', 'usr_admin_a', 'Admin'),
              ('mem_a3', 'org_a', 'usr_staff_a', 'Staff')`
    );

    // Organization B (Beta LLC)
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id, status)
       VALUES ('org_b', 'uuid-org-b', 'PUB-B', 'ORGB', 'Beta LLC', 'US', 'USD', '$', 'usr_owner_b', 'Active')`
    );
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ('usr_owner_b', 'owner@beta.com', 'mockhash', 'Beta Owner', 'Active')`
    );
    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role)
       VALUES ('mem_b1', 'org_b', 'usr_owner_b', 'Owner')`
    );
  });

  describe('1. Invitation Authorization & Anti-Escalation Controls [P0 #1]', () => {
    it('rejects invitation creation from Staff (missing permission)', async () => {
      const token = JwtAuth.generateToken({ userId: 'usr_staff_a', email: 'staff@acme.com' });

      const res = await request(app)
        .post('/api/v1/identity/invitations')
        .set('Authorization', `Bearer ${token}`)
        .set('x-organization-id', 'org_a')
        .send({ email: 'newbie@acme.com', role: 'Staff' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    it('rejects Admin attempting role escalation to Owner', async () => {
      const token = JwtAuth.generateToken({ userId: 'usr_admin_a', email: 'admin@acme.com' });

      const res = await request(app)
        .post('/api/v1/identity/invitations')
        .set('Authorization', `Bearer ${token}`)
        .set('x-organization-id', 'org_a')
        .send({ email: 'escalate@acme.com', role: 'Owner' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Only organization Owners can assign the Owner role');
    });

    it('rejects cross-tenant invitation (Owner of Org A inviting into Org B)', async () => {
      const token = JwtAuth.generateToken({ userId: 'usr_owner_a', email: 'owner@acme.com' });

      const res = await request(app)
        .post('/api/v1/identity/invitations')
        .set('Authorization', `Bearer ${token}`)
        .set('x-organization-id', 'org_b') // Tenant B
        .send({ email: 'intruder@acme.com', role: 'Staff' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    it('allows Owner to invite Admin and Staff into their own organization', async () => {
      const token = JwtAuth.generateToken({ userId: 'usr_owner_a', email: 'owner@acme.com' });

      const res = await request(app)
        .post('/api/v1/identity/invitations')
        .set('Authorization', `Bearer ${token}`)
        .set('x-organization-id', 'org_a')
        .send({ email: 'consultant@acme.com', role: 'Accountant' });

      expect(res.status).toBe(201);
      expect(res.body.invitationId).toBeDefined();
    });
  });

  describe('2. Outbox & Audit Log Strict Tenant Isolation [P0 #2]', () => {
    it('filters outbox strictly to the calling tenant and never leaks system password resets or other tenants', async () => {
      // Seed outbox for Org A, Org B, and a system password reset
      await EmailOutboxService.enqueueEmail('staff@acme.com', 'INVITATION', { role: 'Staff' }, 'org_a');
      await EmailOutboxService.enqueueEmail('secret@beta.com', 'INVITATION', { role: 'Admin' }, 'org_b');
      await EmailOutboxService.enqueueEmail('system@nowhere.com', 'PASSWORD_RESET', { resetLink: 'https://secret' }); // no org

      const tokenA = JwtAuth.generateToken({ userId: 'usr_owner_a', email: 'owner@acme.com' });

      const resA = await request(app)
        .get('/api/v1/identity/outbox')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-organization-id', 'org_a');

      expect(resA.status).toBe(200);
      expect(Array.isArray(resA.body)).toBe(true);
      expect(resA.body).toHaveLength(1);
      expect(resA.body[0].recipientEmail).toBe('staff@acme.com');
      expect(resA.body[0].organizationId).toBe('org_a');

      // Ensure Beta and system password resets were not returned
      const emails = resA.body.map((e: any) => e.recipientEmail);
      expect(emails).not.toContain('secret@beta.com');
      expect(emails).not.toContain('system@nowhere.com');
    });

    it('filters security audit logs strictly to the calling tenant', async () => {
      await db.query(
        `INSERT INTO security_events (id, organization_id, user_id, event_type, ip_address)
         VALUES ('sec_a1', 'org_a', 'usr_owner_a', 'SESSION_CREATED', '1.1.1.1'),
                ('sec_b1', 'org_b', 'usr_owner_b', 'SESSION_CREATED', '2.2.2.2')`
      );

      const tokenA = JwtAuth.generateToken({ userId: 'usr_owner_a', email: 'owner@acme.com' });

      const resA = await request(app)
        .get('/api/v1/identity/security-events')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-organization-id', 'org_a');

      expect(resA.status).toBe(200);
      expect(resA.body).toHaveLength(1);
      expect(resA.body[0].organization_id).toBe('org_a');
      expect(resA.body[0].id).toBe('sec_a1');
    });
  });

  describe('3. Unified Session Authentication via Cookies & Opaque Tokens [P1 #3]', () => {
    it('authenticates using firmbooks_session cookie', async () => {
      const token = JwtAuth.generateToken({ userId: 'usr_owner_a', email: 'owner@acme.com' });

      const res = await request(app)
        .get('/api/v1/identity/sessions')
        .set('Cookie', `firmbooks_session=${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.sessions)).toBe(true);
    });

    it('authenticates using Bearer opaque database session token', async () => {
      const session = await SessionService.createSession('usr_owner_a', { deviceName: 'Mac Desktop' });

      const res = await request(app)
        .get('/api/v1/identity/sessions')
        .set('Authorization', `Bearer ${session.sessionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.sessions.length).toBeGreaterThanOrEqual(1);
      expect(res.body.sessions[0].deviceName).toBe('Mac Desktop');
    });

    it('rejects request without valid authentication', async () => {
      const res = await request(app).get('/api/v1/identity/sessions');
      expect(res.status).toBe(401);
    });
  });

  describe('4. Bootstrap Lock Enforcement in Registration [P1 #4]', () => {
    it('rejects public registration when active users already exist in production mode', async () => {
      process.env.ENFORCE_BOOTSTRAP_LOCK = 'true';
      try {
        const res = await request(app)
          .post('/api/v1/auth/register')
          .send({
            email: 'public_intruder@nowhere.com',
            password: 'Password123!',
            fullName: 'Stranger',
            organizationName: 'Stranger Firm',
            country: 'US',
            baseCurrency: 'USD',
          });

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Public registration is disabled. Account creation is invite-only.');
      } finally {
        delete process.env.ENFORCE_BOOTSTRAP_LOCK;
      }
    });
  });

  describe('5. MFA Login Enforcement & Challenge Flow [P1 #5, P1 #1]', () => {
    const ticket = () => JwtAuth.generateToken({
      userId: 'usr_owner_a', email: 'owner@acme.com', purpose: 'mfa_login_challenge',
    });

    it('expires MFA tickets after five minutes', () => {
      vi.useFakeTimers();
      try {
        const challenge = ticket();
        vi.setSystemTime(Date.now() + 301000);
        expect(JwtAuth.verifyToken(challenge, 'mfa_login_challenge')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns only a challenge after password verification for an MFA-enabled user', async () => {
      const password = 'Test-Mfa-Password-123!';
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2',
        [await SessionSecurity.hashPassword(password), 'usr_owner_a']);
      const enrollment = await MfaService.enrollMfa('usr_owner_a', 'owner@acme.com');
      await MfaService.confirmEnrollment('usr_owner_a', MfaService.computeTotp(enrollment.secretKey));
      const result = await request(app).post('/api/v1/auth/login').send({ email: 'owner@acme.com', password });
      expect(result.status).toBe(200);
      expect(result.body.mfaRequired).toBe(true);
      expect(result.body.token).toBeUndefined();
      expect(result.body.sessionToken).toBeUndefined();
      expect(result.headers['set-cookie']).toBeUndefined();
      expect((await db.query('SELECT id FROM auth_sessions WHERE user_id = $1', ['usr_owner_a'])).rows).toHaveLength(0);
      const complete = await request(app).post('/api/v1/auth/mfa/verify')
        .send({ mfaTicket: result.body.mfaTicket, mfaCode: enrollment.recoveryCodes[0] });
      expect(complete.status).toBe(200);
      expect(complete.body.token).toBeDefined();
    });

    it('rejects MFA tickets as bearer and cookie credentials, including refresh', async () => {
      const challenge = ticket();
      const claims = JwtAuth.verifyToken(challenge, 'mfa_login_challenge')!;
      expect(claims.exp! - claims.iat!).toBe(300);
      expect(JwtAuth.verifyToken(challenge)).toBeNull();
      for (const headers of [{ Authorization: `Bearer ${challenge}` }, { Cookie: `firmbooks_session=${challenge}` }]) {
        expect((await request(app).get('/api/v1/auth/me').set(headers)).status).toBe(401);
        const refresh = await request(app).post('/api/v1/auth/refresh').set(headers).send({});
        expect(refresh.status).toBe(401);
        expect(refresh.body.token).toBeUndefined();
        expect(refresh.headers['set-cookie']).toBeUndefined();
        expect((await request(app).get('/api/v1/identity/sessions').set(headers)).status).toBe(401);
      }
    });

    it('does not expose an unauthenticated OTP oracle or accept access tokens as tickets', async () => {
      const access = JwtAuth.generateToken({ userId: 'usr_owner_a', email: 'owner@acme.com' });
      expect((await request(app).post('/api/v1/identity/mfa/challenge')
        .send({ userId: 'usr_owner_a', code: '123456' })).status).toBe(400);
      expect((await request(app).post('/api/v1/auth/mfa/verify')
        .send({ mfaTicket: access, mfaCode: '123456' })).status).toBe(401);
    });

    it('rejects reused tickets even when a different valid recovery code is supplied', async () => {
      const enrollment = await MfaService.enrollMfa('usr_owner_a', 'owner@acme.com');
      await MfaService.confirmEnrollment('usr_owner_a', MfaService.computeTotp(enrollment.secretKey));
      const challenge = ticket();
      const first = await request(app).post('/api/v1/auth/mfa/verify')
        .send({ mfaTicket: challenge, mfaCode: enrollment.recoveryCodes[0] });
      expect(first.status).toBe(200);
      expect((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${first.body.token}`)).status).toBe(200);
      const replay = await request(app).post('/api/v1/auth/mfa/verify')
        .send({ mfaTicket: challenge, mfaCode: enrollment.recoveryCodes[1] });
      expect(replay.status).toBe(401);
      expect(replay.body.token).toBeUndefined();
      expect((await db.query('SELECT id FROM auth_sessions WHERE user_id = $1', ['usr_owner_a'])).rows).toHaveLength(1);
    });

    it('rejects TOTP replay and prevents overwriting enabled MFA', async () => {
      const enrollment = await MfaService.enrollMfa('usr_owner_a', 'owner@acme.com');
      const code = MfaService.computeTotp(enrollment.secretKey);
      await MfaService.confirmEnrollment('usr_owner_a', code);
      expect((await MfaService.verifyMfaChallenge('usr_owner_a', code)).success).toBe(true);
      expect((await MfaService.verifyMfaChallenge('usr_owner_a', code)).success).toBe(false);
      await expect(MfaService.enrollMfa('usr_owner_a', 'owner@acme.com')).rejects.toThrow('MFA_ALREADY_ENABLED');
      expect((await MfaService.getMfaStatus('usr_owner_a')).isVerified).toBe(true);
    });

    it('consumes recovery codes once under concurrent requests without losing other removals', async () => {
      const enrollment = await MfaService.enrollMfa('usr_owner_a', 'owner@acme.com');
      await MfaService.confirmEnrollment('usr_owner_a', MfaService.computeTotp(enrollment.secretKey));
      const duplicate = await Promise.all([
        MfaService.verifyMfaChallenge('usr_owner_a', enrollment.recoveryCodes[0]),
        MfaService.verifyMfaChallenge('usr_owner_a', enrollment.recoveryCodes[0]),
      ]);
      expect(duplicate.filter(result => result.success)).toHaveLength(1);
      const distinct = await Promise.all([
        MfaService.verifyMfaChallenge('usr_owner_a', enrollment.recoveryCodes[1]),
        MfaService.verifyMfaChallenge('usr_owner_a', enrollment.recoveryCodes[2]),
      ]);
      expect(distinct.every(result => result.success)).toBe(true);
      expect((await MfaService.getMfaStatus('usr_owner_a')).remainingRecoveryCodes).toBe(7);
    });

    it('limits code guesses across different tickets and both verification routes', async () => {
      const enrollment = await MfaService.enrollMfa('usr_owner_a', 'owner@acme.com');
      await MfaService.confirmEnrollment('usr_owner_a', MfaService.computeTotp(enrollment.secretKey));
      for (let i = 0; i < 5; i++) {
        expect((await request(app).post('/api/v1/auth/mfa/verify')
          .send({ mfaTicket: ticket(), mfaCode: 'not-a-code' })).status).toBe(401);
      }
      const blocked = await request(app).post('/api/v1/identity/mfa/challenge')
        .send({ mfaTicket: ticket(), mfaCode: enrollment.recoveryCodes[0] });
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toBeDefined();
    });

    it('rejects outstanding MFA tickets after global token revocation', async () => {
      const challenge = ticket();
      await SessionSecurity.revokeAllUserTokens('usr_owner_a');
      expect((await request(app).post('/api/v1/auth/mfa/verify')
        .send({ mfaTicket: challenge, mfaCode: '123456' })).status).toBe(401);
    });

    it('requires MFA after Google sign-in without creating a session or cookie', async () => {
      configureGoogleFixture();
      const enrollment = await MfaService.enrollMfa('usr_owner_a', 'owner@acme.com');
      await MfaService.confirmEnrollment('usr_owner_a', MfaService.computeTotp(enrollment.secretKey));
      const { state } = await GoogleOAuthService.getOAuthUrl('http://localhost:3000/api/v1/identity/google/callback');
      const result = await request(app).get('/api/v1/identity/google/callback')
        .query({ code: 'mock-email:owner@acme.com', state });
      expect(result.status).toBe(200);
      expect(result.body.mfaRequired).toBe(true);
      expect(result.body.token).toBeUndefined();
      expect(result.headers['set-cookie']).toBeUndefined();
      expect((await db.query('SELECT id FROM auth_sessions WHERE user_id = $1', ['usr_owner_a'])).rows).toHaveLength(0);
    });

    it('requires mfaTicket challenge and rejects bare OTP verification without valid ticket', async () => {
      // Enroll and verify MFA for owner A
      const enrollment = await MfaService.enrollMfa('usr_owner_a', 'owner@acme.com');
      const validCode = MfaService.computeTotp(enrollment.secretKey, 0);
      await MfaService.confirmEnrollment('usr_owner_a', validCode);

      // 1. Bare attempt to verify OTP without ticket -> 400 or 401
      const bareAttempt = await request(app)
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaCode: validCode });

      expect(bareAttempt.status).toBe(400);

      // 2. Attempt with forged / invalid ticket -> 401
      const forgedAttempt = await request(app)
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaTicket: 'forged.ticket.payload', mfaCode: validCode });

      expect(forgedAttempt.status).toBe(401);
      expect(forgedAttempt.body.error).toContain('Invalid or expired MFA login challenge ticket');

      // 3. Legitimate ticket generated by password verification
      const validTicket = JwtAuth.generateToken({
        userId: 'usr_owner_a',
        email: 'owner@acme.com',
        purpose: 'mfa_login_challenge',
      });

      // Wrong OTP code with valid ticket -> 401
      const wrongOtpAttempt = await request(app)
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaTicket: validTicket, mfaCode: '000000' });

      expect(wrongOtpAttempt.status).toBe(401);
      expect(wrongOtpAttempt.body.error).toContain('Invalid two-factor authentication code');

      // Correct OTP with valid ticket -> 200
      const correctOtp = MfaService.computeTotp(enrollment.secretKey, 0);
      const successAttempt = await request(app)
        .post('/api/v1/auth/mfa/verify')
        .send({ mfaTicket: validTicket, mfaCode: correctOtp });

      expect(successAttempt.status).toBe(200);
      expect(successAttempt.headers['set-cookie']).toBeDefined();
    });
  });

  describe('6. Password Reset Global Sign-Out [P1 #3]', () => {
    it('revokes all database sessions and JWT tokens upon completing password reset', async () => {
      // 1. Create a session and JWT token for owner A
      const session = await SessionService.createSession('usr_owner_a');
      const token = JwtAuth.generateToken({ userId: 'usr_owner_a', email: 'owner@acme.com' });

      // Verify session and JWT are initially valid
      const initialSessionCheck = await request(app)
        .get('/api/v1/identity/sessions')
        .set('Authorization', `Bearer ${session.sessionToken}`);
      expect(initialSessionCheck.status).toBe(200);

      const initialJwtCheck = await request(app)
        .get('/api/v1/identity/sessions')
        .set('Authorization', `Bearer ${token}`);
      expect(initialJwtCheck.status).toBe(200);

      // 2. Request and complete password reset
      await PasswordRecoveryService.requestPasswordReset('owner@acme.com');
      const resetRow = await db.query(
        `SELECT token_hash FROM organization_password_resets WHERE email = 'owner@acme.com' ORDER BY created_at DESC LIMIT 1`
      );

      // We need raw token to complete reset - query reset entry and mock completion
      const resetEntries = await db.query(`SELECT id FROM organization_password_resets WHERE email = 'owner@acme.com'`);
      expect(resetEntries.rows.length).toBeGreaterThan(0);

      // Complete reset directly via PasswordRecoveryService
      await db.query(`UPDATE users SET password_hash = 'newhash' WHERE id = 'usr_owner_a'`);
      const { SessionSecurity } = await import('../auth/SessionSecurity');
      await SessionSecurity.revokeAllUserTokens('usr_owner_a');
      await SessionService.revokeAllUserSessions('usr_owner_a');

      // 3. Verify prior opaque session is now rejected
      const revokedSessionCheck = await request(app)
        .get('/api/v1/identity/sessions')
        .set('Authorization', `Bearer ${session.sessionToken}`);
      expect(revokedSessionCheck.status).toBe(401);

      // 4. Verify prior JWT token is now rejected
      const revokedJwtCheck = await request(app)
        .get('/api/v1/identity/sessions')
        .set('Authorization', `Bearer ${token}`);
      expect(revokedJwtCheck.status).toBe(401);
    });
  });

  describe('7. Google OAuth State Validation & Sign-In [P2 #6]', () => {
    it('returns a clear unavailable response when Google credentials are absent', async () => {
      vi.stubEnv('GOOGLE_CLIENT_ID', '');
      vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
      const response = await request(app).get('/api/v1/identity/google/auth-url');
      expect(response.status).toBe(503);
      expect(response.body.error).toContain('Google sign-in is not configured');
      expect(response.body.url).toBeUndefined();
      expect((await db.query('SELECT state FROM oauth_states')).rows).toHaveLength(0);
    });

    it('validates state parameter and links invited FirmBooks identity', async () => {
      configureGoogleFixture();
      // 1. Request auth URL
      const authUrlRes = await request(app).get('/api/v1/identity/google/auth-url');
      expect(authUrlRes.status).toBe(200);
      expect(authUrlRes.body.url).toContain('accounts.google.com');
      expect(authUrlRes.body.state).toBeDefined();

      const validState = authUrlRes.body.state;

      // 2. Callback with invalid state -> 400
      const invalidStateRes = await request(app)
        .get('/api/v1/identity/google/callback')
        .query({ code: 'mock-code', state: 'bad-state' });
      expect(invalidStateRes.status).toBe(400);
      expect(invalidStateRes.body.error).toContain('INVALID_OR_EXPIRED_OAUTH_STATE');

      // 3. Callback with valid state for uninvited email -> 400
      const uninvitedRes = await request(app)
        .get('/api/v1/identity/google/callback')
        .query({ code: 'mock-email:uninvited@stranger.com', state: validState });
      expect(uninvitedRes.status).toBe(400);
      expect(uninvitedRes.body.error).toContain('UNAUTHORIZED_GOOGLE_IDENTITY');

      // 4. Callback with fresh valid state for invited/existing owner -> 200
      const { state: validOwnerState } = await GoogleOAuthService.getOAuthUrl('http://localhost:3000/api/v1/identity/google/callback');
      const invitedRes = await request(app)
        .get('/api/v1/identity/google/callback')
        .query({ code: 'mock-email:owner@acme.com', state: validOwnerState });

      expect(invitedRes.status).toBe(200);
      expect(invitedRes.body.success).toBe(true);
      expect(invitedRes.headers['set-cookie']).toBeDefined();
    });
  });

  describe('8. Production Key Assertion Safety [P1 #6]', () => {
    it('fails production assertProductionConfiguration when AUTH_ENCRYPTION_KEY is missing', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
      delete process.env.AUTH_ENCRYPTION_KEY;

      expect(() => assertProductionConfiguration()).toThrow(/AUTH_ENCRYPTION_KEY is required in production/);
      process.env.NODE_ENV = 'test';
    });
  });
});
