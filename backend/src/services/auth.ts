import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@busgo/shared';
import { env } from '../config/env';
import { User } from '../models';
import { HttpError } from '../utils/http';

export interface AuthUser {
  id: string;
  role: Role;
  operatorId?: string;
}
declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthUser;
    rawBody?: Buffer;
  }
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const checkPassword = (p: string, h: string) => bcrypt.compare(p, h);
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
/** One-way hash for single-use reset tokens (only the hash is stored). */
export const hashToken = (token: string) => sha(`reset:${token}`);

export function signAccess(u: { _id: unknown; role: string; operatorId?: unknown }) {
  const payload: AuthUser = { id: String(u._id), role: u.role as Role, operatorId: u.operatorId ? String(u.operatorId) : undefined };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'] });
}

export async function issueRefresh(userId: string) {
  const token = jwt.sign({ id: userId, n: crypto.randomUUID() }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.JWT_REFRESH_TTL_DAYS}d`,
  });
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 864e5);
  await User.updateOne(
    { _id: userId },
    { $push: { refreshTokens: { $each: [{ hash: sha(token), expiresAt }], $slice: -10 } } },
  );
  return token;
}

/**
 * Rotating refresh: every use issues a new token. The old one stays valid for a short grace window so
 * two near-simultaneous page loads (or tabs) don't race and log the user out.
 */
export const REFRESH_GRACE_MS = 30_000;
export async function rotateRefresh(token: string) {
  let id: string;
  try {
    id = (jwt.verify(token, env.JWT_REFRESH_SECRET) as { id: string }).id;
  } catch {
    throw new HttpError(401, 'INVALID_REFRESH');
  }
  const now = new Date();
  const user = await User.findOneAndUpdate(
    { _id: id, refreshTokens: { $elemMatch: { hash: sha(token), expiresAt: { $gt: now } } } },
    { $set: { 'refreshTokens.$[t].expiresAt': new Date(Math.min(now.getTime() + REFRESH_GRACE_MS, Date.now() + env.JWT_REFRESH_TTL_DAYS * 864e5)) } },
    { arrayFilters: [{ 't.hash': sha(token) }] },
  );
  if (!user) throw new HttpError(401, 'INVALID_REFRESH');
  await User.updateOne({ _id: id }, { $pull: { refreshTokens: { expiresAt: { $lte: now } } } });
  return { user, refresh: await issueRefresh(id) };
}

export async function revokeRefresh(token?: string) {
  if (!token) return;
  await User.updateOne({ 'refreshTokens.hash': sha(token) }, { $pull: { refreshTokens: { hash: sha(token) } } });
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) {
    try {
      req.auth = jwt.verify(h.slice(7), env.JWT_ACCESS_SECRET) as AuthUser;
    } catch {
      /* treated as guest */
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  optionalAuth(req, res, () => {
    if (!req.auth) return next(new HttpError(401, 'LOGIN_REQUIRED', 'Please log in to continue'));
    next();
  });
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction) =>
    requireAuth(req, res, (err?: unknown) => {
      if (err) return next(err);
      if (!roles.includes(req.auth!.role)) return next(new HttpError(403, 'FORBIDDEN'));
      next();
    });
