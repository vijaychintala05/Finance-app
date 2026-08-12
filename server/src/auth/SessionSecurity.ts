import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../database/db';
import { newId } from '../utils/ids';

export interface RateLimitStatus {
  allowed: boolean;
  attempts: number;
  lockoutSecondsRemaining: number;
}

export class SessionSecurity {
  private static failedAttempts: Map<string, { count: number; lastAttempt: number }> = new Map();
  private static LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private static MAX_ATTEMPTS = 5;

  public static checkRateLimit(key: string): RateLimitStatus {
    const record = this.failedAttempts.get(key);
    const now = Date.now();

    if (!record) {
      return { allowed: true, attempts: 0, lockoutSecondsRemaining: 0 };
    }

    if (now - record.lastAttempt > this.LOCKOUT_WINDOW_MS) {
      this.failedAttempts.delete(key);
      return { allowed: true, attempts: 0, lockoutSecondsRemaining: 0 };
    }

    if (record.count >= this.MAX_ATTEMPTS) {
      const remainingMs = this.LOCKOUT_WINDOW_MS - (now - record.lastAttempt);
      return {
        allowed: false,
        attempts: record.count,
        lockoutSecondsRemaining: Math.ceil(remainingMs / 1000),
      };
    }

    return { allowed: true, attempts: record.count, lockoutSecondsRemaining: 0 };
  }

  public static recordFailedAttempt(key: string): void {
    const record = this.failedAttempts.get(key);
    const now = Date.now();

    if (!record || now - record.lastAttempt > this.LOCKOUT_WINDOW_MS) {
      this.failedAttempts.set(key, { count: 1, lastAttempt: now });
    } else {
      record.count += 1;
      record.lastAttempt = now;
    }
  }

  public static clearRateLimit(key: string): void {
    this.failedAttempts.delete(key);
  }

  private static rateLimitHash(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  public static async checkPersistentRateLimit(key: string): Promise<RateLimitStatus> {
    const keyHash = this.rateLimitHash(key);
    const result = await db.query(
      'SELECT attempt_count, last_attempt_at FROM auth_rate_limits WHERE key_hash = $1',
      [keyHash]
    );
    if (result.rows.length === 0) return { allowed: true, attempts: 0, lockoutSecondsRemaining: 0 };
    const record = result.rows[0];
    const lastAttempt = new Date(record.last_attempt_at || record.lastAttemptAt).getTime();
    const age = Date.now() - lastAttempt;
    if (age > this.LOCKOUT_WINDOW_MS) {
      await db.query('DELETE FROM auth_rate_limits WHERE key_hash = $1', [keyHash]);
      return { allowed: true, attempts: 0, lockoutSecondsRemaining: 0 };
    }
    const attempts = Number(record.attempt_count || record.attemptCount || 0);
    return {
      allowed: attempts < this.MAX_ATTEMPTS,
      attempts,
      lockoutSecondsRemaining: attempts >= this.MAX_ATTEMPTS ? Math.ceil((this.LOCKOUT_WINDOW_MS - age) / 1000) : 0,
    };
  }

  public static async recordPersistentFailure(key: string): Promise<void> {
    const keyHash = this.rateLimitHash(key);
    const existing = await db.query('SELECT attempt_count FROM auth_rate_limits WHERE key_hash = $1', [keyHash]);
    if (existing.rows.length === 0) {
      await db.query(
        'INSERT INTO auth_rate_limits (key_hash, attempt_count, last_attempt_at) VALUES ($1, 1, CURRENT_TIMESTAMP)',
        [keyHash]
      );
    } else {
      await db.query(
        'UPDATE auth_rate_limits SET attempt_count = attempt_count + 1, last_attempt_at = CURRENT_TIMESTAMP WHERE key_hash = $1',
        [keyHash]
      );
    }
  }

  public static async clearPersistentRateLimit(key: string): Promise<void> {
    await db.query('DELETE FROM auth_rate_limits WHERE key_hash = $1', [this.rateLimitHash(key)]);
  }

  public static async hashPassword(password: string): Promise<string> {
    if (!password || password.length < 12) {
      throw new Error('Password must be at least 8 characters; the current security policy requires 12');
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      throw new Error('Password must include upper-case, lower-case, number, and symbol characters');
    }
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
  }

  public static async verifyPassword(password: string, hash: string): Promise<boolean> {
    if (!hash) return false;
    return bcrypt.compare(password, hash);
  }

  public static async revokeAllUserTokens(userId: string): Promise<void> {
    const revokedAt = new Date().toISOString();
    await db.query(
      `INSERT INTO revoked_tokens (id, user_id, revoked_at) VALUES ($1, $2, $3)`,
      [newId('rev'), userId, revokedAt]
    );
  }

  public static async isTokenRevoked(userId: string, tokenIssuedAt: number): Promise<boolean> {
    const res = await db.query(
      `SELECT revoked_at FROM revoked_tokens WHERE user_id = $1 ORDER BY revoked_at DESC LIMIT 1`,
      [userId]
    );

    if (res.rows.length === 0) return false;
    const revokedTime = new Date(res.rows[0].revoked_at || res.rows[0].revokedAt).getTime();
    return tokenIssuedAt * 1000 <= revokedTime;
  }

  public static generatePasswordResetToken(userId: string): { token: string; expiresAt: string } {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
    return { token, expiresAt };
  }
}
