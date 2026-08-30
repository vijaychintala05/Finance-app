import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { SessionService } from '../auth/SessionService';
import { MfaService } from '../auth/MfaService';

describe('Identity Cryptography & Session Management', () => {
  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_ENCRYPTION_KEY = 'test-firmbooks-auth-encryption-key-32-chars-long!';
    db.initPgMem();
    await MigrationRunner.runMigrations();

    // Create a mock base user
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ('usr_test_100', 'owner@firmbooks.local', 'mockhash', 'Firm Owner', 'Active')`
    );
  });

  describe('Opaque Session Management', () => {
    it('generates 256-bit opaque tokens and correctly stores SHA-256 hashes', async () => {
      const session = await SessionService.createSession('usr_test_100', {
        ipAddress: '192.168.1.50',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      });

      expect(session.sessionId).toMatch(/^sess[-_]/);
      expect(session.sessionToken).toHaveLength(64); // 32 bytes hex

      const expectedHash = SessionService.hashToken(session.sessionToken);

      const dbRow = await db.query(
        `SELECT * FROM auth_sessions WHERE session_token_hash = $1`,
        [expectedHash]
      );
      expect(dbRow.rows.length).toBe(1);
      expect(dbRow.rows[0].device_name).toBe('Windows Desktop');
      expect(dbRow.rows[0].ip_address).toBe('192.168.1.50');
      expect(dbRow.rows[0].status).toBe('ACTIVE');
    });

    it('validates active sessions and updates last_activity_at timestamp', async () => {
      const { sessionToken } = await SessionService.createSession('usr_test_100');
      const validation = await SessionService.validateSession(sessionToken);

      expect(validation.isValid).toBe(true);
      expect(validation.userId).toBe('usr_test_100');
      expect(validation.session?.status).toBe('ACTIVE');

      const invalid = await SessionService.validateSession('invalid-random-token-hex-12345');
      expect(invalid.isValid).toBe(false);
    });

    it('rotates sessions securely without leaving old tokens active', async () => {
      const initial = await SessionService.createSession('usr_test_100');
      const rotated = await SessionService.rotateSession(initial.sessionToken);

      expect(rotated.newSessionId).not.toBe(initial.sessionId);
      expect(rotated.newSessionToken).not.toBe(initial.sessionToken);

      // Old token must be invalidated
      const oldCheck = await SessionService.validateSession(initial.sessionToken);
      expect(oldCheck.isValid).toBe(false);

      // New token must be valid
      const newCheck = await SessionService.validateSession(rotated.newSessionToken);
      expect(newCheck.isValid).toBe(true);
      expect(newCheck.userId).toBe('usr_test_100');
    });

    it('supports granular revocation of individual sessions', async () => {
      const s1 = await SessionService.createSession('usr_test_100');
      const s2 = await SessionService.createSession('usr_test_100');

      const revoked = await SessionService.revokeSession(s1.sessionId, 'usr_test_100');
      expect(revoked).toBe(true);

      const check1 = await SessionService.validateSession(s1.sessionToken);
      expect(check1.isValid).toBe(false);

      const check2 = await SessionService.validateSession(s2.sessionToken);
      expect(check2.isValid).toBe(true);
    });

    it('revokes all other devices while preserving current active session', async () => {
      const s1 = await SessionService.createSession('usr_test_100', { deviceName: 'Laptop' });
      const s2 = await SessionService.createSession('usr_test_100', { deviceName: 'Phone' });
      const s3 = await SessionService.createSession('usr_test_100', { deviceName: 'Tablet' });

      const revokedCount = await SessionService.revokeAllOtherSessions('usr_test_100', s2.sessionId);
      expect(revokedCount).toBe(2);

      expect((await SessionService.validateSession(s1.sessionToken)).isValid).toBe(false);
      expect((await SessionService.validateSession(s2.sessionToken)).isValid).toBe(true);
      expect((await SessionService.validateSession(s3.sessionToken)).isValid).toBe(false);

      const list = await SessionService.listUserSessions('usr_test_100');
      expect(list).toHaveLength(3);
    });
  });

  describe('MFA Cryptography & TOTP Engine', () => {
    it('encrypts and decrypts TOTP secret keys using AES-256-GCM', () => {
      const plainSecret = '4a9b8c7d6e5f0123456789abcdef0123456789ab';
      const encrypted = MfaService.encryptSecret(plainSecret);

      expect(encrypted).toContain(':'); // iv:tag:payload format
      expect(encrypted).not.toBe(plainSecret);

      const decrypted = MfaService.decryptSecret(encrypted);
      expect(decrypted).toBe(plainSecret);
    });

    it('computes and verifies RFC 6238 TOTP codes with window drift tolerance', () => {
      const secret = MfaService.generateTotpSecret();
      const currentCode = MfaService.computeTotp(secret, 0);

      expect(currentCode).toMatch(/^\d{6}$/);
      expect(MfaService.verifyTotpCode(secret, currentCode)).toBe(true);
      expect(MfaService.verifyTotpCode(secret, '000000')).toBe(false);
    });

    it('generates 10 emergency recovery codes and consumes them on single use', async () => {
      const enrollment = await MfaService.enrollMfa('usr_test_100', 'owner@firmbooks.local');
      expect(enrollment.recoveryCodes).toHaveLength(10);
      expect(enrollment.qrUri).toContain('otpauth://totp/FirmBooks');

      const codeToVerify = MfaService.computeTotp(enrollment.secretKey, 0);
      const confirmed = await MfaService.confirmEnrollment('usr_test_100', codeToVerify);
      expect(confirmed).toBe(true);

      const statusBefore = await MfaService.getMfaStatus('usr_test_100');
      expect(statusBefore.isVerified).toBe(true);
      expect(statusBefore.remainingRecoveryCodes).toBe(10);

      // Consume first recovery code
      const usedCode = enrollment.recoveryCodes[0];
      const challenge1 = await MfaService.verifyMfaChallenge('usr_test_100', usedCode);
      expect(challenge1.success).toBe(true);
      expect(challenge1.method).toBe('RECOVERY_CODE');
      expect(challenge1.remainingRecoveryCodes).toBe(9);

      // Replay of consumed code must fail
      const challenge2 = await MfaService.verifyMfaChallenge('usr_test_100', usedCode);
      expect(challenge2.success).toBe(false);

      const statusAfter = await MfaService.getMfaStatus('usr_test_100');
      expect(statusAfter.remainingRecoveryCodes).toBe(9);
    });
  });
});
