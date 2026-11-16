import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { User } from '../models/User.js';

/** Needs `Authorization: Bearer <accessToken>`; sets req.user. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue');
  }
  const { sub } = verifyAccessToken(token);
  const user = await User.findById(sub);
  if (!user) {
    throw new AppError(401, 'INVALID_TOKEN', 'Access token is invalid');
  }
  if (user.status === 'suspended') {
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended');
  }
  req.user = user;
  next();
}
