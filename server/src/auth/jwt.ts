import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/environment';
import { newId } from '../utils/ids';

const JWT_EXPIRES_IN = '15m';
const JWT_ISSUER = 'firmbooks-api';
const JWT_AUDIENCE = 'firmbooks-web';

export interface TokenPayload {
  userId: string;
  email: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

export class JwtAuth {
  public static generateToken(payload: TokenPayload): string {
    return jwt.sign(
      { userId: payload.userId, email: payload.email },
      getJwtSecret(),
      {
        expiresIn: JWT_EXPIRES_IN,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        jwtid: newId('tok'),
        algorithm: 'HS256',
      }
    );
  }

  public static verifyToken(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, getJwtSecret(), {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        algorithms: ['HS256'],
      }) as TokenPayload;
    } catch (e) {
      return null;
    }
  }
}
