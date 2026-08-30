import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../database/db';
import { newId } from '../utils/ids';
import { EmailOutboxService } from '../services/EmailOutboxService';
import { SessionSecurity } from './SessionSecurity';
import { SessionService } from './SessionService';

export class PasswordRecoveryService {
  private static RESET_TTL_HOURS = 1;

  public static hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  public static async requestPasswordReset(
    email: string,
    reqIp?: string
  ): Promise<{ message: string }> {
    const cleanEmail = (email || '').toLowerCase().trim();
    const GENERIC_RESPONSE = { message: 'If an account exists, instructions have been sent to your email.' };

    if (!cleanEmail) {
      return GENERIC_RESPONSE;
    }

    const userRes = await db.query(
      `SELECT id, status FROM users WHERE email = $1`,
      [cleanEmail]
    );

    if (userRes.rows.length === 0 || userRes.rows[0].status !== 'Active') {
      // Return same response to prevent user enumeration
      return GENERIC_RESPONSE;
    }

    const userId = userRes.rows[0].id;
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = PasswordRecoveryService.hashToken(rawToken);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + PasswordRecoveryService.RESET_TTL_HOURS * 3600000).toISOString();

    const resetId = newId('rst');
    await db.query(
      `INSERT INTO organization_password_resets (id, user_id, email, token_hash, requested_by_ip, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')`,
      [resetId, userId, cleanEmail, tokenHash, reqIp || '127.0.0.1', expiresAt]
    );

    // Enqueue password reset email
    await EmailOutboxService.enqueueEmail(cleanEmail, 'PASSWORD_RESET', {
      resetId,
      resetLink: `/#/reset-password?token=${rawToken}`,
      expiresAt,
    });

    await db.query(
      `INSERT INTO security_events (id, user_id, event_type, ip_address, metadata)
       VALUES ($1, $2, 'PASSWORD_RESET_REQUESTED', $3, $4)`,
      [newId('sec'), userId, reqIp || '127.0.0.1', JSON.stringify({ resetId })]
    );

    return GENERIC_RESPONSE;
  }

  public static async completePasswordReset(
    rawToken: string,
    newPassword: string
  ): Promise<{ success: boolean; userId: string; message: string }> {
    if (!rawToken) {
      throw new Error('INVALID_INPUT: Reset token is required.');
    }

    // 1. Enforce uniform enterprise password policy across registration and reset
    const newPasswordHash = await SessionSecurity.hashPassword(newPassword);
    const tokenHash = PasswordRecoveryService.hashToken(rawToken);

    let targetUserId = '';
    let targetResetId = '';

    // 2. Atomically validate and claim reset token in a single transactional conditional update
    await db.transaction(async (client) => {
      const nowIso = new Date().toISOString();
      const claimRes = await client.query(
        `UPDATE organization_password_resets
         SET status = 'USED', used_at = CURRENT_TIMESTAMP
         WHERE token_hash = $1
           AND status = 'PENDING'
           AND used_at IS NULL
           AND expires_at > $2
         RETURNING id, user_id, email`,
        [tokenHash, nowIso]
      );

      if (claimRes.rows.length === 0) {
        throw new Error('INVALID_OR_EXPIRED_RESET_TOKEN: The password reset link is invalid, expired, or has already been used.');
      }

      const row = claimRes.rows[0];
      targetUserId = row.user_id;
      targetResetId = row.id;

      // 3. Update user password
      await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newPasswordHash, targetUserId]);
      await client.query(`UPDATE user_identities SET password_hash = $1 WHERE user_id = $2`, [newPasswordHash, targetUserId]);

      // 4. Global Sign-Out: Invalidate all existing database sessions AND revoke all JWT tokens
      await client.query(
        `INSERT INTO revoked_tokens (id, user_id, revoked_at) VALUES ($1, $2, CURRENT_TIMESTAMP)`,
        [newId('rev'), targetUserId]
      );
      await client.query(
        `UPDATE auth_sessions SET status = 'REVOKED' WHERE user_id = $1 AND status = 'ACTIVE'`,
        [targetUserId]
      );

      await client.query(
        `INSERT INTO security_events (id, user_id, event_type, metadata)
         VALUES ($1, $2, 'PASSWORD_RESET_COMPLETED', $3)`,
        [newId('sec'), targetUserId, JSON.stringify({ resetId: targetResetId, globalSignOut: true })]
      );
    });

    return {
      success: true,
      userId: targetUserId,
      message: 'Password has been reset successfully. All existing sessions have been signed out.',
    };
  }
}
