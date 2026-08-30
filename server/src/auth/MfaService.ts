import crypto from 'crypto';
import { db } from '../database/db';
import { newId } from '../utils/ids';
import { getAuthEncryptionKey } from '../config/environment';

export class MfaService {
  private static ALGORITHM = 'aes-256-gcm';

  private static getEncryptionKey(): Buffer {
    const rawKey = getAuthEncryptionKey();
    return crypto.createHash('sha256').update(rawKey).digest();
  }

  public static encryptSecret(plainSecret: string): string {
    const key = MfaService.getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(MfaService.ALGORITHM, key, iv) as crypto.CipherGCM;
    let encrypted = cipher.update(plainSecret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  public static decryptSecret(encryptedPayload: string): string {
    const [ivHex, authTagHex, encryptedData] = encryptedPayload.split(':');
    if (!ivHex || !authTagHex || !encryptedData) {
      throw new Error('INVALID_MFA_ENCRYPTION_PAYLOAD');
    }
    const key = MfaService.getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(MfaService.ALGORITHM, key, iv) as crypto.DecipherGCM;
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  public static generateTotpSecret(): string {
    // 20 bytes random = 160 bits (Standard TOTP secret length)
    return crypto.randomBytes(20).toString('hex');
  }

  public static generateRecoveryCodes(count: number = 10): { plainCodes: string[]; hashedCodes: string[] } {
    const plainCodes: string[] = [];
    const hashedCodes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = `${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
      plainCodes.push(code);
      hashedCodes.push(crypto.createHash('sha256').update(code).digest('hex'));
    }
    return { plainCodes, hashedCodes };
  }

  /**
   * RFC 6238 TOTP computation (30s time-step, 6 digits)
   */
  public static computeTotp(secretHex: string, timeStepWindow: number = 0): string {
    const epoch = Math.floor(Date.now() / 1000);
    const counter = Math.floor(epoch / 30) + timeStepWindow;
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(counter));

    const secretBuf = Buffer.from(secretHex, 'hex');
    const hmac = crypto.createHmac('sha1', secretBuf).update(buffer).digest();

    const offset = hmac[hmac.length - 1] & 0x0f;
    const binaryCode =
      ((hmmacCode(hmac[offset]) & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = (binaryCode % 1000000).toString().padStart(6, '0');
    return otp;
  }

  public static verifyTotpCode(secretHex: string, userCode: string): boolean {
    const cleanCode = (userCode || '').trim();
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      return false;
    }

    // Check current window and +/- 1 step for clock drift tolerance
    for (let window = -1; window <= 1; window++) {
      if (MfaService.computeTotp(secretHex, window) === cleanCode) {
        return true;
      }
    }
    return false;
  }

  public static async enrollMfa(
    userId: string,
    email: string
  ): Promise<{ secretKey: string; qrUri: string; recoveryCodes: string[] }> {
    const rawSecret = MfaService.generateTotpSecret();
    const encryptedSecret = MfaService.encryptSecret(rawSecret);
    const { plainCodes, hashedCodes } = MfaService.generateRecoveryCodes(10);

    await db.query(
      `INSERT INTO mfa_credentials (id, user_id, totp_secret_encrypted, is_enforced, is_verified, recovery_code_hashes)
       VALUES ($1, $2, $3, FALSE, FALSE, $4)
       ON CONFLICT (user_id) DO UPDATE
       SET totp_secret_encrypted = EXCLUDED.totp_secret_encrypted,
           is_verified = FALSE,
           recovery_code_hashes = EXCLUDED.recovery_code_hashes`,
      [newId('mfa'), userId, encryptedSecret, JSON.stringify(hashedCodes)]
    );

    const qrUri = `otpauth://totp/FirmBooks:${encodeURIComponent(email)}?secret=${rawSecret}&issuer=FirmBooks&algorithm=SHA1&digits=6&period=30`;

    return {
      secretKey: rawSecret,
      qrUri,
      recoveryCodes: plainCodes,
    };
  }

  public static async confirmEnrollment(userId: string, code: string): Promise<boolean> {
    const res = await db.query(
      `SELECT id, totp_secret_encrypted FROM mfa_credentials WHERE user_id = $1`,
      [userId]
    );

    if (res.rows.length === 0) {
      throw new Error('MFA_NOT_ENROLLED: User has not initiated MFA setup');
    }

    const { totp_secret_encrypted } = res.rows[0];
    const rawSecret = MfaService.decryptSecret(totp_secret_encrypted);

    const isValid = MfaService.verifyTotpCode(rawSecret, code);
    if (!isValid) {
      return false;
    }

    await db.query(
      `UPDATE mfa_credentials SET is_verified = TRUE WHERE user_id = $1`,
      [userId]
    );

    await db.query(
      `INSERT INTO security_events (id, user_id, event_type, metadata)
       VALUES ($1, $2, 'MFA_ENROLLED', $3)`,
      [newId('sec'), userId, JSON.stringify({ verified: true })]
    );

    return true;
  }

  public static async verifyMfaChallenge(
    userId: string,
    codeOrRecoveryCode: string
  ): Promise<{ success: boolean; method?: 'TOTP' | 'RECOVERY_CODE'; remainingRecoveryCodes?: number }> {
    const res = await db.query(
      `SELECT id, totp_secret_encrypted, is_verified, recovery_code_hashes
       FROM mfa_credentials
       WHERE user_id = $1`,
      [userId]
    );

    if (res.rows.length === 0 || !res.rows[0].is_verified) {
      return { success: false };
    }

    const { totp_secret_encrypted, recovery_code_hashes } = res.rows[0];
    const rawSecret = MfaService.decryptSecret(totp_secret_encrypted);

    const inputTrimmed = (codeOrRecoveryCode || '').trim();

    // 1. Try TOTP 6-digit verification
    if (inputTrimmed.length === 6 && /^\d{6}$/.test(inputTrimmed)) {
      if (MfaService.verifyTotpCode(rawSecret, inputTrimmed)) {
        return { success: true, method: 'TOTP' };
      }
    }

    // 2. Try Emergency Recovery Code
    const hashes: string[] = typeof recovery_code_hashes === 'string'
      ? JSON.parse(recovery_code_hashes)
      : (recovery_code_hashes || []);

    const inputHash = crypto.createHash('sha256').update(inputTrimmed.toUpperCase()).digest('hex');
    const hashIndex = hashes.indexOf(inputHash);

    if (hashIndex !== -1) {
      // Consume recovery code (single-use)
      hashes.splice(hashIndex, 1);
      await db.query(
        `UPDATE mfa_credentials SET recovery_code_hashes = $1 WHERE user_id = $2`,
        [JSON.stringify(hashes), userId]
      );

      await db.query(
        `INSERT INTO security_events (id, user_id, event_type, metadata)
         VALUES ($1, $2, 'RECOVERY_CODE_CONSUMED', $3)`,
        [newId('sec'), userId, JSON.stringify({ remainingCodes: hashes.length })]
      );

      return { success: true, method: 'RECOVERY_CODE', remainingRecoveryCodes: hashes.length };
    }

    return { success: false };
  }

  public static async getMfaStatus(userId: string): Promise<{
    isEnrolled: boolean;
    isVerified: boolean;
    isEnforced: boolean;
    remainingRecoveryCodes: number;
  }> {
    const res = await db.query(
      `SELECT is_enforced, is_verified, recovery_code_hashes FROM mfa_credentials WHERE user_id = $1`,
      [userId]
    );

    if (res.rows.length === 0) {
      return { isEnrolled: false, isVerified: false, isEnforced: false, remainingRecoveryCodes: 0 };
    }

    const row = res.rows[0];
    const hashes: string[] = typeof row.recovery_code_hashes === 'string'
      ? JSON.parse(row.recovery_code_hashes)
      : (row.recovery_code_hashes || []);

    return {
      isEnrolled: true,
      isVerified: Boolean(row.is_verified),
      isEnforced: Boolean(row.is_enforced),
      remainingRecoveryCodes: hashes.length,
    };
  }
}

function hmmacCode(byte: number): number {
  return byte;
}
