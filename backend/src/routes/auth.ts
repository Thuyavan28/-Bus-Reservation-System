import crypto from 'crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env, isProd } from '../config/env';
import { PasswordReset, Passenger, User } from '../models';
import { audit } from '../services/audit';
import { emailConfigured, enqueueEmail } from '../services/email';
import { checkPassword, hashPassword, hashToken, issueRefresh, requireAuth, revokeRefresh, rotateRefresh, signAccess } from '../services/auth';
import { asyncHandler, HttpError, parse } from '../utils/http';

const r = Router();
const phone = z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number');
const age = z.number().int().min(1, 'Enter a valid age').max(120, 'Enter a valid age');
const gender = z.enum(['male', 'female', 'other'], { errorMap: () => ({ message: 'Gender is required' }) });

const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 40 });

const cookieOpts = { httpOnly: true, sameSite: 'lax' as const, secure: isProd, path: '/api/auth', maxAge: env.JWT_REFRESH_TTL_DAYS * 864e5 };

const publicUser = (u: any) => ({ id: String(u._id), name: u.name, email: u.email, phone: u.phone, gender: u.gender, role: u.role, operatorId: u.operatorId ? String(u.operatorId) : undefined, language: u.language, age: u.age ?? null });

async function session(res: any, u: any) {
  res.cookie('rt', await issueRefresh(String(u._id)), cookieOpts);
  return { user: publicUser(u), accessToken: signAccess(u) };
}

r.post('/signup', authLimiter, asyncHandler(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(2).max(80), email: z.string().email(), phone, gender, age: age.optional(), password: z.string().min(8).max(100) }), req.body);
  if (await User.exists({ $or: [{ email: b.email.toLowerCase() }, { phone: b.phone }] })) throw new HttpError(409, 'ACCOUNT_EXISTS', 'An account with this email or phone already exists');
  const u = await User.create({ ...b, passwordHash: await hashPassword(b.password) });
  // Seed the user as their own first saved passenger (gender + phone are mandatory there too).
  // (only when the age is known: no invented values)
  if (u.age) await Passenger.create({ userId: u._id, name: u.name, age: u.age, gender: u.gender, phone: u.phone, relation: 'Self' });
  await enqueueEmail(u.email, 'welcome', undefined, { name: u.name, email: u.email }, `welcome:${u._id}`).catch((e) => console.warn('[email] welcome not queued:', e.message));
  res.status(201).json(await session(res, u));
}));

r.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const b = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
  const u = await User.findOne({ email: b.email.toLowerCase() });
  if (!u || !(await checkPassword(b.password, u.passwordHash))) throw new HttpError(401, 'BAD_CREDENTIALS', 'Wrong email or password');
  res.json(await session(res, u));
}));

// Forgot password: email a single-use link (30 min). The response never reveals whether the email exists.
// With no email provider configured (development) the link is also returned as `devLink` and logged.
const forgotLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 8, skip: () => env.NODE_ENV === 'test' });
r.post('/forgot', forgotLimiter, asyncHandler(async (req, res) => {
  const { email } = parse(z.object({ email: z.string().email() }), req.body);
  const u = await User.findOne({ email: email.toLowerCase() });
  let devLink: string | undefined;
  if (u) {
    const token = crypto.randomBytes(32).toString('hex');
    await PasswordReset.deleteMany({ userId: u._id });
    await PasswordReset.create({ userId: u._id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60_000) });
    const link = `${(env.PUBLIC_APP_URL || env.CLIENT_URL).replace(/\/$/, '')}/reset-password/${token}`;
    await enqueueEmail(u.email, 'password_reset', undefined, { link, name: u.name });
    await audit('auth.password_reset_requested', { actorId: String(u._id) });
    if (!isProd && !emailConfigured()) { devLink = link; console.log(`[password-reset] ${u.email} -> ${link}`); }
  }
  res.json({ sent: true, ...(devLink ? { devLink } : {}) });
}));

r.post('/reset', forgotLimiter, asyncHandler(async (req, res) => {
  const b = parse(z.object({ token: z.string().min(20).max(200), password: z.string().min(8).max(100) }), req.body);
  const rec = await PasswordReset.findOneAndDelete({ tokenHash: hashToken(b.token), expiresAt: { $gt: new Date() } });
  if (!rec) throw new HttpError(400, 'RESET_LINK_INVALID', 'This reset link is invalid or has expired. Please request a new one.');
  // new password + every existing session is signed out
  const u = await User.findByIdAndUpdate(rec.userId, { $set: { passwordHash: await hashPassword(b.password), refreshTokens: [] } }, { new: true });
  if (!u) throw new HttpError(400, 'RESET_LINK_INVALID');
  await audit('auth.password_reset', { actorId: String(u._id) });
  res.json({ ok: true });
}));

r.post('/refresh', asyncHandler(async (req, res) => {
  const { user, refresh } = await rotateRefresh(req.cookies?.rt ?? '');
  res.cookie('rt', refresh, cookieOpts);
  res.json({ user: publicUser(user), accessToken: signAccess(user) });
}));

r.post('/logout', asyncHandler(async (req, res) => {
  await revokeRefresh(req.cookies?.rt);
  res.clearCookie('rt', { path: '/api/auth' });
  res.json({ ok: true });
}));

r.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const u = await User.findById(req.auth!.id);
  if (!u) throw new HttpError(401, 'LOGIN_REQUIRED');
  res.json({ user: publicUser(u) });
}));

r.patch('/me', requireAuth, asyncHandler(async (req, res) => {
  const b = parse(z.object({ name: z.string().min(2).max(80).optional(), phone: phone.optional(), gender: gender.optional(), age: age.optional(), language: z.enum(['en', 'ta', 'ml', 'kn']).optional() }), req.body);
  // Seat eligibility depends on gender, so the account's gender is fixed once it is set at signup.
  if (b.gender) {
    const cur = await User.findById(req.auth!.id).select('gender').lean();
    if (cur?.gender && cur.gender !== b.gender) throw new HttpError(403, 'GENDER_LOCKED', 'Gender cannot be changed after signup');
    delete b.gender;
  }
  const u = await User.findByIdAndUpdate(req.auth!.id, { $set: b }, { new: true });
  res.json({ user: publicUser(u) });
}));

export default r;
