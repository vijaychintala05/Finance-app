import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../database/db';

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

  public static async hashPassword(password: string): Promise<string> {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    const salt = await bcrypt.genSalt(10);
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
      [`rev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`, userId, revokedAt]
    );
  }

  public static async isTokenRevoked(userId: string, tokenIssuedAt: number): Promise<boolean> {
    const res = await db.query(
      `SELECT revoked_at FROM revoked_tokens WHERE user_id = $1 ORDER BY revoked_at DESC LIMIT 1`,
      [userId]
    );

    if (res.rows.length === 0) return false;
    const revokedTime = new Date(res.rows[0].revoked_at || res.rows[0].revokedAt).getTime();
    return tokenIssuedAt < revokedTime;
  }

  public static generatePasswordResetToken(userId: string): { token: string; expiresAt: string } {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
    return { token, expiresAt };
  }
}
