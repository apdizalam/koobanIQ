import { createHash, randomBytes } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Types } from 'mongoose';
import { env } from '../config/env.js';
import { AppError } from './errors.js';
import { RefreshToken } from '../models/RefreshToken.js';
import type { Role } from '../models/User.js';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

/** Short-lived JWT (HS256) sent as `Authorization: Bearer <token>`. */
export function signAccessToken(userId: string, role: Role) {
  const token = jwt.sign({ role }, env.jwtAccessSecret, {
    algorithm: 'HS256',
    subject: userId,
    expiresIn: env.jwtAccessTtl as SignOptions['expiresIn'],
  });
  const { exp, iat } = jwt.decode(token) as { exp: number; iat: number };
  return { token, expiresIn: exp - iat };
}

/** Throws 401 TOKEN_EXPIRED or 401 INVALID_TOKEN. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.jwtAccessSecret, { algorithms: ['HS256'] });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Access token has expired');
    }
    throw new AppError(401, 'INVALID_TOKEN', 'Access token is invalid');
  }
  if (typeof payload === 'string' || !payload.sub) {
    throw new AppError(401, 'INVALID_TOKEN', 'Access token is invalid');
  }
  return { sub: payload.sub, role: payload.role as Role };
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Long-lived random refresh token. The client keeps the token; the DB keeps only its hash. */
export async function issueRefreshToken(userId: Types.ObjectId | string, device?: string) {
  const token = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + env.refreshTokenDays * 24 * 60 * 60 * 1000);
  await RefreshToken.create({ userId, tokenHash: hashToken(token), expiresAt, device });
  return { token, expiresAt };
}
