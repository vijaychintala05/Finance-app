import crypto from 'crypto';
import { db } from '../database/db';
import { newId } from '../utils/ids';

export interface AuthSessionModel {
  id: string;
  userId: string;
  sessionTokenHash: string;
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
  status: 'ACTIVE' | 'ROTATED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string;
  lastActivityAt: string;
  createdAt: string;
}

export class SessionService {
  private static SESSION_TTL_DAYS = 14;

  public static hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  public static generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  public static parseDeviceName(userAgent?: string): string {
    if (!userAgent) return 'Unknown Device';
    if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
      return 'Mobile Device';
    }
    if (userAgent.includes('Macintosh') || userAgent.includes('Mac OS')) {
      return 'Mac Desktop';
    }
    if (userAgent.includes('Windows')) {
      return 'Windows Desktop';
    }
    if (userAgent.includes('Linux')) {
      return 'Linux Workstation';
    }
    return 'Web Browser';
  }

  public static async createSession(
    userId: string,
    metadata?: { ipAddress?: string; userAgent?: string; deviceName?: string }
  ): Promise<{ sessionId: string; sessionToken: string; expiresAt: string }> {
    const sessionId = newId('sess');
    const rawToken = SessionService.generateSessionToken();
    const tokenHash = SessionService.hashToken(rawToken);

    const now = new Date();
    const expiresAtDate = new Date(now.getTime() + SessionService.SESSION_TTL_DAYS * 86400000);
    const expiresAt = expiresAtDate.toISOString();

    const deviceName = metadata?.deviceName || SessionService.parseDeviceName(metadata?.userAgent);
    const ipAddress = metadata?.ipAddress || '127.0.0.1';
    const userAgent = metadata?.userAgent || '';

    await db.query(
      `INSERT INTO auth_sessions (id, user_id, session_token_hash, device_name, ip_address, user_agent, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7)`,
      [sessionId, userId, tokenHash, deviceName, ipAddress, userAgent, expiresAt]
    );

    // Record login security event
    await db.query(
      `INSERT INTO security_events (id, user_id, event_type, ip_address, user_agent, metadata)
       VALUES ($1, $2, 'SESSION_CREATED', $3, $4, $5)`,
      [newId('sec'), userId, ipAddress, userAgent, JSON.stringify({ sessionId, deviceName })]
    );

    return { sessionId, sessionToken: rawToken, expiresAt };
  }

  public static async validateSession(
    rawToken: string
  ): Promise<{ isValid: boolean; userId?: string; sessionId?: string; session?: AuthSessionModel }> {
    if (!rawToken || typeof rawToken !== 'string') {
      return { isValid: false };
    }

    const tokenHash = SessionService.hashToken(rawToken);
    const res = await db.query(
      `SELECT id, user_id, session_token_hash, device_name, ip_address, user_agent, status, expires_at, last_activity_at, created_at
       FROM auth_sessions
       WHERE session_token_hash = $1`,
      [tokenHash]
    );

    if (res.rows.length === 0) {
      return { isValid: false };
    }

    const row = res.rows[0];
    const now = new Date();
    const expiresAt = new Date(row.expires_at);

    if (row.status !== 'ACTIVE' || expiresAt <= now) {
      return { isValid: false };
    }

    // Update last activity asynchronously
    await db.query(
      `UPDATE auth_sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [row.id]
    );

    return {
      isValid: true,
      userId: row.user_id,
      sessionId: row.id,
      session: {
        id: row.id,
        userId: row.user_id,
        sessionTokenHash: row.session_token_hash,
        deviceName: row.device_name,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        status: row.status,
        expiresAt: row.expires_at,
        lastActivityAt: row.last_activity_at,
        createdAt: row.created_at,
      },
    };
  }

  public static async rotateSession(
    oldRawToken: string,
    metadata?: { ipAddress?: string; userAgent?: string; deviceName?: string }
  ): Promise<{ newSessionId: string; newSessionToken: string; expiresAt: string }> {
    const oldHash = SessionService.hashToken(oldRawToken);
    const res = await db.query(
      `SELECT id, user_id FROM auth_sessions WHERE session_token_hash = $1 AND status = 'ACTIVE'`,
      [oldHash]
    );

    if (res.rows.length === 0) {
      throw new Error('INVALID_SESSION: Cannot rotate non-existent or inactive session');
    }

    const { id: oldSessionId, user_id: userId } = res.rows[0];

    // Mark old session as ROTATED
    await db.query(
      `UPDATE auth_sessions SET status = 'ROTATED' WHERE id = $1`,
      [oldSessionId]
    );

    const newSession = await SessionService.createSession(userId, metadata);
    return {
      newSessionId: newSession.sessionId,
      newSessionToken: newSession.sessionToken,
      expiresAt: newSession.expiresAt,
    };
  }

  public static async revokeSession(sessionId: string, userId: string): Promise<boolean> {
    const res = await db.query(
      `UPDATE auth_sessions SET status = 'REVOKED' WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );

    if ((res.rowCount || 0) > 0) {
      await db.query(
        `INSERT INTO security_events (id, user_id, event_type, metadata)
         VALUES ($1, $2, 'SESSION_REVOKED', $3)`,
        [newId('sec'), userId, JSON.stringify({ sessionId })]
      );
      return true;
    }
    return false;
  }

  public static async revokeAllUserSessions(userId: string): Promise<number> {
    const res = await db.query(
      `UPDATE auth_sessions SET status = 'REVOKED' WHERE user_id = $1 AND status = 'ACTIVE'`,
      [userId]
    );

    const count = res.rowCount || 0;
    await db.query(
      `INSERT INTO security_events (id, user_id, event_type, metadata)
       VALUES ($1, $2, 'ALL_SESSIONS_REVOKED', $3)`,
      [newId('sec'), userId, JSON.stringify({ revokedCount: count })]
    );
    return count;
  }

  public static async revokeAllOtherSessions(userId: string, currentSessionId: string): Promise<number> {
    const res = await db.query(
      `UPDATE auth_sessions SET status = 'REVOKED' WHERE user_id = $1 AND id != $2 AND status = 'ACTIVE'`,
      [userId, currentSessionId]
    );

    const count = res.rowCount || 0;
    await db.query(
      `INSERT INTO security_events (id, user_id, event_type, metadata)
       VALUES ($1, $2, 'ALL_OTHER_SESSIONS_REVOKED', $3)`,
      [newId('sec'), userId, JSON.stringify({ currentSessionId, revokedCount: count })]
    );
    return count;
  }

  public static async listUserSessions(userId: string): Promise<AuthSessionModel[]> {
    const res = await db.query(
      `SELECT id, user_id, session_token_hash, device_name, ip_address, user_agent, status, expires_at, last_activity_at, created_at
       FROM auth_sessions
       WHERE user_id = $1
       ORDER BY last_activity_at DESC`,
      [userId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      sessionTokenHash: row.session_token_hash,
      deviceName: row.device_name,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      status: row.status,
      expiresAt: row.expires_at,
      lastActivityAt: row.last_activity_at,
      createdAt: row.created_at,
    }));
  }
}
