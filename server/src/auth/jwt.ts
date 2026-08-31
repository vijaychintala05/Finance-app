import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/environment';
import { newId } from '../utils/ids';

const JWT_EXPIRES_IN = '15m';
const JWT_ISSUER = 'firmbooks-api';
const JWT_AUDIENCE = 'firmbooks-web';

export interface TokenPayload {
  userId: string;
  email: string;
  purpose?: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

export class JwtAuth {
  public static generateToken(payload: TokenPayload): string {
    const claims: Record<string, any> = {
      userId: payload.userId,
      email: payload.email,
    };
    if (payload.purpose) {
      claims.purpose = payload.purpose;
    }

    return jwt.sign(
      claims,
      getJwtSecret(),
      {
        expiresIn: payload.purpose === 'mfa_login_challenge' ? '5m' : JWT_EXPIRES_IN,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        jwtid: newId('tok'),
        algorithm: 'HS256',
      }
    );
  }

  public static verifyToken(token: string, purpose?: 'mfa_login_challenge'): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, getJwtSecret(), {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        algorithms: ['HS256'],
      }) as TokenPayload;
      // Challenge tokens are never access tokens, including at refresh endpoints.
      if (decoded.purpose !== purpose || !decoded.userId || !decoded.email || !decoded.jti) return null;
      return decoded;
    } catch (e) {
      return null;
    }
  }
}
