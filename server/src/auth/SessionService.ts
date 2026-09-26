import crypto from 'crypto';
import { db, DbQueryClient } from '../database/db';
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
    metadata?: { ipAddress?: string; userAgent?: string; deviceName?: string },
    transactionClient?: DbQueryClient
  ): Promise<{ sessionId: string; sessionToken: string; expiresAt: string }> {
    const sessionId = newId('sess');
    const rawToken = SessionService.generateSessionToken();
    const tokenHash = SessionService.hashToken(rawToken);

    const now = new Date();
    const expiresAtDate = new Date(now.getTime() + SessionService.SESSION_TTL_DAYS * 86400000);
    const expiresAt = expiresAtDate.toISOString();

    const deviceName = metadata?.deviceName || SessionService.parseDeviceName(metadata?.userAgent);
    const ipAddress = metadata?.ipAddress || null;
    const userAgent = metadata?.userAgent || '';

    const insertSession = async (client: DbQueryClient) => {
      await client.query(
        `INSERT INTO auth_sessions (id, user_id, session_token_hash, device_name, ip_address, user_agent, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7)`,
        [sessionId, userId, tokenHash, deviceName, ipAddress, userAgent, expiresAt]
      );
      await client.query(
        `INSERT INTO security_events (id, user_id, event_type, ip_address, user_agent, metadata)
         VALUES ($1, $2, 'SESSION_CREATED', $3, $4, $5)`,
        [newId('sec'), userId, ipAddress, userAgent, JSON.stringify({ sessionId, deviceName })]
      );
    };
    if (transactionClient) await insertSession(transactionClient);
    else await db.transaction(insertSession);

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
      `UPDATE auth_sessions SET last_activity_at = CURRENT_TIMESTAMP
       WHERE session_token_hash = $1 AND status = 'ACTIVE' AND expires_at > $2
       RETURNING id, user_id, session_token_hash, device_name, ip_address, user_agent, status, expires_at, last_activity_at, created_at`,
      [tokenHash, new Date().toISOString()]
    );

    if (res.rows.length !== 1) return { isValid: false };

    const row = res.rows[0];

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

  public static async validateJwtSession(sessionId: string, userId: string): Promise<boolean> {
    if (!sessionId || !userId) return false;
    const touched = await db.query(
      `UPDATE auth_sessions SET last_activity_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND status = 'ACTIVE' AND expires_at > $3
       RETURNING id`,
      [sessionId, userId, new Date().toISOString()]
    );
    return touched.rowCount === 1;
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
    return db.transaction(async (client) => {
      const res = await client.query(
        `UPDATE auth_sessions SET status = 'REVOKED' WHERE id = $1 AND user_id = $2 AND status = 'ACTIVE' RETURNING id`,
        [sessionId, userId]
      );
      if ((res.rowCount || 0) === 0) return false;
      await client.query(
        `INSERT INTO security_events (id, user_id, event_type, metadata)
         VALUES ($1, $2, 'SESSION_REVOKED', $3)`,
        [newId('sec'), userId, JSON.stringify({ sessionId })]
      );
      return true;
    });
  }

  public static async revokeAllUserSessions(userId: string): Promise<number> {
    return db.transaction(async (client) => {
      const res = await client.query(
        `UPDATE auth_sessions SET status = 'REVOKED' WHERE user_id = $1 AND status = 'ACTIVE' RETURNING id`,
        [userId]
      );
      const count = res.rowCount || 0;
      if (count > 0) {
        await client.query(
          `INSERT INTO security_events (id, user_id, event_type, metadata)
           VALUES ($1, $2, 'ALL_SESSIONS_REVOKED', $3)`,
          [newId('sec'), userId, JSON.stringify({ revokedCount: count })]
        );
      }
      return count;
    });
  }

  public static async revokeAllOtherSessions(userId: string, currentSessionId: string): Promise<number> {
    if (!currentSessionId) throw new Error('CURRENT_SESSION_REQUIRED');
    return db.transaction(async (client) => {
      const current = await client.query(
        `SELECT id FROM auth_sessions WHERE id = $1 AND user_id = $2 AND status = 'ACTIVE' FOR UPDATE`,
        [currentSessionId, userId]
      );
      if ((current.rowCount || 0) !== 1) throw new Error('CURRENT_SESSION_INVALID');
      const res = await client.query(
        `UPDATE auth_sessions SET status = 'REVOKED' WHERE user_id = $1 AND id <> $2 AND status = 'ACTIVE' RETURNING id`,
        [userId, currentSessionId]
      );
      const count = res.rowCount || 0;
      if (count > 0) {
        await client.query(
          `INSERT INTO security_events (id, user_id, event_type, metadata)
           VALUES ($1, $2, 'ALL_OTHER_SESSIONS_REVOKED', $3)`,
          [newId('sec'), userId, JSON.stringify({ currentSessionId, revokedCount: count })]
        );
      }
      return count;
    });
  }

  public static async listUserSessions(userId: string): Promise<Array<Omit<AuthSessionModel, 'userId' | 'sessionTokenHash'>>> {
    const res = await db.query(
      `SELECT id, device_name, ip_address, user_agent, status, expires_at, last_activity_at, created_at
       FROM auth_sessions
       WHERE user_id = $1
       ORDER BY last_activity_at DESC`,
      [userId]
    );
    return res.rows.map((row) => ({
      id: row.id,
      deviceName: row.device_name,
      ipAddress: row.ip_address || undefined,
      userAgent: row.user_agent || undefined,
      status: row.status === 'ACTIVE' && new Date(row.expires_at) <= new Date() ? 'EXPIRED' : row.status,
      expiresAt: row.expires_at,
      lastActivityAt: row.last_activity_at,
      createdAt: row.created_at,
    }));
  }
}
