import crypto from 'crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env';
import { Booking, Payment } from '../models';
import { requireAuth, requireRole } from '../services/auth';
import { applyWebhook, approvalSummary, decideByToken, initiatePayment } from '../services/paymentService';
import { signPayload } from '../services/refundService';
import { asyncHandler, HttpError, parse } from '../utils/http';
import { parseOrigin } from '../utils/network';

const r = Router();

/** Step 1: create the payment and get the external website URL to redirect the browser to. */
r.post('/initiate', requireAuth, asyncHandler(async (req, res) => {
  const b = parse(z.object({ bookingId: z.string() }), req.body);
  const key = String(req.headers['idempotency-key'] ?? '');
  if (key.length < 8) throw new HttpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key header');
  const origin = parseOrigin(req.get('origin')) ?? parseOrigin(req.get('referer'));
  const { payment, redirectUrl, approveUrl, qr, reachable } = await initiatePayment({ userId: req.auth!.id, bookingId: b.bookingId, idempotencyKey: key, origin });
  res.status(201).json({ reference: payment.reference, amount: payment.amount, status: payment.status, redirectUrl, approveUrl, qr, reachable });
}));

/** Public (token = credential): the page opened by scanning the payment QR. */
const approveLimiter = rateLimit({ windowMs: 60_000, limit: 60, skip: () => env.NODE_ENV === 'test' });
r.get('/approve/:token', approveLimiter, asyncHandler(async (req, res) => {
  res.json(await approvalSummary(String(req.params.token)));
}));
r.post('/approve/:token', approveLimiter, asyncHandler(async (req, res) => {
  const { decision } = parse(z.object({ decision: z.enum(['accept', 'reject']) }), req.body);
  res.json(await decideByToken(String(req.params.token), decision));
}));

/** The return page polls this until the webhook has confirmed (or failed) the payment. */
r.get('/:reference', requireAuth, asyncHandler(async (req, res) => {
  const p = await Payment.findOne({ reference: req.params.reference, userId: req.auth!.id }).lean();
  if (!p) throw new HttpError(404, 'PAYMENT_NOT_FOUND');
  const b = await Booking.findById(p.bookingId).select('status pnr').lean();
  res.json({ reference: p.reference, status: p.status, bookingId: String(p.bookingId), bookingStatus: b?.status, pnr: b?.pnr, reason: p.failureReason });
}));

/** Signed webhook from the external payment website. */
r.post('/webhook', asyncHandler(async (req, res) => {
  const sig = String(req.headers['x-signature'] ?? '');
  const expected = signPayload(req.rawBody?.toString('utf8') ?? '');
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
    throw new HttpError(401, 'BAD_SIGNATURE');
  const ev = parse(
    z.object({ eventId: z.string().min(4), type: z.enum(['payment', 'refund']).optional(), reference: z.string(), status: z.enum(['success', 'failed']), gatewayTxnId: z.string().optional(), amount: z.number().optional(), reason: z.string().optional() }),
    req.body,
  );
  res.json(await applyWebhook(ev));
}));

/** Operator/admin manual approval of a payment ("if we approve, the order is placed"). */
r.post('/:reference/approve', requireRole('operator', 'admin'), asyncHandler(async (req, res) => {
  const p = await Payment.findOne({ reference: req.params.reference });
  if (!p) throw new HttpError(404, 'PAYMENT_NOT_FOUND');
  const b = await Booking.findById(p.bookingId).lean();
  if (req.auth!.role === 'operator' && String(b?.operatorId) !== req.auth!.operatorId) throw new HttpError(403, 'FORBIDDEN');
  res.json(await applyWebhook({ eventId: `manual-${p.reference}`, reference: p.reference, status: 'success', amount: p.amount, gatewayTxnId: `MANUAL-${p.reference}` }));
}));

// ---------- dev stand-in for the external payment website ----------
// Only mounted when EXTERNAL_PAYMENT_URL is empty. It behaves like a third-party site: shows the order,
// the user approves or declines, then it calls our signed webhook and redirects back to return_url.
export const mockGateway = Router();
mockGateway.get('/', (req, res) => {
  const { ref = '', amount = '', callback = '', return_url = '', sig = '' } = req.query as Record<string, string>;
  if (sig !== signPayload(`${ref}|${amount}`)) return res.status(400).send('Invalid payment link');
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const f = (decision: string, label: string, color: string) => `<form method="POST" action="/mock-gateway/decide" style="display:inline"><input type="hidden" name="ref" value="${esc(ref)}"/><input type="hidden" name="amount" value="${esc(amount)}"/><input type="hidden" name="callback" value="${esc(callback)}"/><input type="hidden" name="return_url" value="${esc(return_url)}"/><input type="hidden" name="sig" value="${esc(sig)}"/><input type="hidden" name="decision" value="${decision}"/><button style="background:${color};color:#fff;border:0;padding:14px 26px;border-radius:12px;font-size:16px;font-weight:700;margin:6px">${label}</button></form>`;
  res.send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial;background:#EEF0FF;display:grid;place-items:center;min-height:100vh;margin:0"><div style="background:#fff;border-radius:20px;padding:28px;max-width:380px;width:90%;text-align:center"><p style="color:#5B6075;margin:0">Demo external payment site</p><h2 style="margin:6px 0">Pay ₹${esc(amount)}</h2><p style="font-size:13px;color:#5B6075">Order ${esc(ref)}</p>${f('success', 'Approve payment', '#0F766E')}${f('failed', 'Decline', '#B42318')}</div></body>`);
});
mockGateway.post('/decide', asyncHandler(async (req, res) => {
  const { ref, amount, callback, return_url, sig, decision } = req.body as Record<string, string>;
  if (sig !== signPayload(`${ref}|${amount}`)) throw new HttpError(400, 'BAD_LINK');
  const body = JSON.stringify({ eventId: `gw-${ref}-${decision}`, reference: ref, status: decision, amount: Number(amount), gatewayTxnId: decision === 'success' ? `GW-${ref}` : undefined, reason: decision === 'failed' ? 'Declined on payment site' : undefined });
  const resp = await fetch(callback, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-signature': signPayload(body) }, body });
  if (!resp.ok) throw new HttpError(502, 'WEBHOOK_FAILED', `Webhook returned ${resp.status}`);
  res.redirect(303, return_url);
}));
void env;
export default r;
