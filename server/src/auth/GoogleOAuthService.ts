import crypto from 'crypto';
import { db } from '../database/db';
import { newId } from '../utils/ids';
import { SessionService } from './SessionService';
import { MfaService } from './MfaService';
import { JwtAuth } from './jwt';

export interface GoogleUserInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

export class GoogleOAuthConfigurationError extends Error {
  constructor() {
    super('Google sign-in is not configured for this server. Use email and password, or ask the administrator to configure Google sign-in.');
    this.name = 'GoogleOAuthConfigurationError';
  }
}

export class GoogleOAuthService {
  private static credentials(): { clientId: string; clientSecret: string } {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret || clientId === 'mock-google-client-id.apps.googleusercontent.com') {
      throw new GoogleOAuthConfigurationError();
    }
    return { clientId, clientSecret };
  }
  public static async createPkceSession(): Promise<{ state: string; codeVerifier: string; codeChallenge: string }> {
    // 1. Generate high-entropy 43-128 char code verifier
    const codeVerifier = crypto.randomBytes(32).toString('base64url');

    // 2. Generate SHA-256 code challenge for S256 method
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    // 3. Generate single-use random state
    const state = crypto.randomBytes(32).toString('hex');

    // 4. Record single-use state in database
    await db.query(
      `INSERT INTO oauth_states (state, code_verifier, created_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)`,
      [state, codeVerifier]
    );

    return { state, codeVerifier, codeChallenge };
  }

  public static async consumeOAuthState(state: string): Promise<string> {
    if (!state || typeof state !== 'string') {
      throw new Error('INVALID_OAUTH_STATE: State token is required.');
    }

    const fifteenMinutesAgoIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // Single-use atomic state consumption with 15-minute validity window
    const res = await db.query(
      `UPDATE oauth_states
       SET used_at = CURRENT_TIMESTAMP
       WHERE state = $1
         AND used_at IS NULL
         AND created_at > $2
       RETURNING code_verifier`,
      [state, fifteenMinutesAgoIso]
    );

    if (res.rows.length === 0) {
      throw new Error('INVALID_OR_EXPIRED_OAUTH_STATE: The OAuth state is invalid, expired, or has already been consumed.');
    }

    return res.rows[0].code_verifier;
  }

  public static async getOAuthUrl(redirectUri: string): Promise<{ url: string; state: string }> {
    const { clientId } = GoogleOAuthService.credentials();
    const { state, codeChallenge } = await GoogleOAuthService.createPkceSession();

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'select_account',
    });

    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state,
    };
  }

  public static async exchangeCodeForProfile(
    code: string,
    redirectUri: string,
    state?: string
  ): Promise<GoogleUserInfo> {
    const { clientId, clientSecret } = GoogleOAuthService.credentials();

    let codeVerifier: string | undefined;
    if (state) {
      codeVerifier = await GoogleOAuthService.consumeOAuthState(state);
    }

    // Real Google OAuth 2.0 PKCE Token Exchange
    const tokenBody: Record<string, string> = {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    };

    if (codeVerifier) {
      tokenBody.code_verifier = codeVerifier;
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenBody),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`GOOGLE_TOKEN_EXCHANGE_FAILED: ${errText}`);
    }

    const tokenData = await tokenRes.json();
    const idToken = tokenData.id_token;

    // Verify ID Token via Google's tokeninfo endpoint
    const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!tokenInfoRes.ok) {
      throw new Error('INVALID_GOOGLE_ID_TOKEN');
    }

    const info = await tokenInfoRes.json();
    if (info.aud !== clientId) {
      throw new Error('GOOGLE_AUDIENCE_MISMATCH');
    }

    return {
      sub: info.sub,
      email: info.email,
      name: info.name,
      picture: info.picture,
      email_verified: info.email_verified === 'true' || info.email_verified === true,
    };
  }

  public static async linkGoogleIdentity(
    userId: string,
    providerSubject: string,
    providerEmail: string
  ): Promise<{ success: boolean; linkId: string }> {
    const cleanEmail = providerEmail.toLowerCase().trim();

    // Verify target user exists and is active
    const userRes = await db.query(
      `SELECT id, status FROM users WHERE id = $1`,
      [userId]
    );

    if (userRes.rows.length === 0 || userRes.rows[0].status !== 'Active') {
      throw new Error('USER_NOT_ACTIVE: User account is not active in FirmBooks.');
    }

    const linkId = newId('ext');
    const existing = await db.query(
      `SELECT id FROM external_identity_links WHERE provider = 'google' AND provider_subject = $1`,
      [providerSubject]
    );

    if (existing.rows.length > 0) {
      await db.query(
        `UPDATE external_identity_links SET user_id = $1, provider_email = $2 WHERE id = $3`,
        [userId, cleanEmail, existing.rows[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO external_identity_links (id, user_id, provider, provider_subject, provider_email)
         VALUES ($1, $2, 'google', $3, $4)`,
        [linkId, userId, providerSubject, cleanEmail]
      );
    }

    await db.query(
      `INSERT INTO security_events (id, user_id, event_type, metadata)
       VALUES ($1, $2, 'GOOGLE_IDENTITY_LINKED', $3)`,
      [newId('sec'), userId, JSON.stringify({ providerEmail: cleanEmail, providerSubject })]
    );

    return { success: true, linkId };
  }

  public static async authenticateGoogleUser(
    providerSubject: string,
    providerEmail: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<{ userId: string; email: string; sessionId?: string; sessionToken?: string; mfaRequired?: boolean; mfaTicket?: string }> {
    const cleanEmail = providerEmail.toLowerCase().trim();

    // 1. Look up existing link
    const linkRes = await db.query(
      `SELECT user_id FROM external_identity_links WHERE provider = 'google' AND provider_subject = $1`,
      [providerSubject]
    );

    let userId: string | null = linkRes.rows[0]?.user_id || null;

    // 2. If not linked, check if an active FirmBooks user exists with this email
    if (!userId) {
      const userRes = await db.query(
        `SELECT id, status FROM users WHERE email = $1 AND status = 'Active'`,
        [cleanEmail]
      );

      if (userRes.rows.length === 0) {
        throw new Error(
          'UNAUTHORIZED_GOOGLE_IDENTITY: Google sign-in is restricted to invited FirmBooks identities. Please contact your organization owner for an invitation.'
        );
      }

      userId = userRes.rows[0].id;
      // Automatically link on first verified email match
      await GoogleOAuthService.linkGoogleIdentity(userId, providerSubject, cleanEmail);
    }

    // Verify user is active
    const activeCheck = await db.query(`SELECT status FROM users WHERE id = $1`, [userId]);
    if (activeCheck.rows[0]?.status !== 'Active') {
      throw new Error('USER_NOT_ACTIVE: User account is deactivated.');
    }

    if ((await MfaService.getMfaStatus(userId)).isVerified) {
      return {
        userId, email: cleanEmail, mfaRequired: true,
        mfaTicket: JwtAuth.generateToken({ userId, email: cleanEmail, purpose: 'mfa_login_challenge' }),
      };
    }

    // 3. Create active session only after all required factors.
    const session = await SessionService.createSession(userId, {
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      deviceName: 'Google OAuth Sign-In',
    });

    await db.query(
      `INSERT INTO security_events (id, user_id, event_type, ip_address, user_agent, metadata)
       VALUES ($1, $2, 'GOOGLE_LOGIN_SUCCESS', $3, $4, $5)`,
      [newId('sec'), userId, metadata?.ipAddress || '127.0.0.1', metadata?.userAgent || 'unknown', JSON.stringify({ providerSubject, providerEmail: cleanEmail })]
    );

    return {
      userId,
      email: cleanEmail,
      sessionId: session.sessionId,
      sessionToken: session.sessionToken,
    };
  }
}
