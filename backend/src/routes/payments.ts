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

  res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BusGo South • Secure Payment Gateway</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
    background: #F8FAFC;
    background-image: 
      radial-gradient(at 50% 0%, rgba(255, 24, 64, 0.08) 0px, transparent 65%),
      radial-gradient(at 100% 100%, rgba(255, 24, 64, 0.04) 0px, transparent 50%);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    color: #0F172A;
  }
  .checkout-card {
    background: #FFFFFF;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 28px;
    box-shadow: 0 20px 45px -12px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.03);
    max-width: 420px;
    width: 100%;
    padding: 28px 24px;
    position: relative;
    overflow: hidden;
    animation: cardIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .card-top-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 5px;
    background: linear-gradient(90deg, #FF1840, #FF5E7E);
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 22px;
  }
  .logo-wrap {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .logo-badge {
    width: 38px;
    height: 38px;
    background: #FF1840;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    box-shadow: 0 4px 12px rgba(255, 24, 64, 0.3);
  }
  .logo-text {
    font-size: 17px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #0F172A;
  }
  .logo-text span {
    color: #FF1840;
  }
  .sec-badge {
    display: flex;
    align-items: center;
    gap: 5px;
    background: #F1F5F9;
    border: 1px solid #E2E8F0;
    border-radius: 20px;
    padding: 5px 10px;
    font-size: 11px;
    font-weight: 700;
    color: #475569;
  }
  .sec-dot {
    width: 6px;
    height: 6px;
    background: #10B981;
    border-radius: 50%;
  }
  .amount-card {
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 20px;
    padding: 20px 16px;
    text-align: center;
    margin-bottom: 20px;
  }
  .amount-label {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #64748B;
    margin-bottom: 4px;
  }
  .amount-val {
    font-size: 38px;
    font-weight: 800;
    color: #0F172A;
    letter-spacing: -0.03em;
    line-height: 1.1;
  }
  .amount-curr {
    font-size: 26px;
    margin-right: 2px;
    color: #FF1840;
    font-weight: 800;
  }
  .order-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    padding: 4px 10px;
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    font-family: monospace;
    font-size: 11px;
    color: #475569;
    font-weight: 600;
  }
  .details-box {
    margin-bottom: 20px;
    font-size: 13px;
  }
  .detail-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #F1F5F9;
  }
  .detail-row:last-child {
    border-bottom: none;
  }
  .detail-key {
    color: #64748B;
    font-weight: 500;
  }
  .detail-val {
    color: #0F172A;
    font-weight: 700;
  }
  .methods-title {
    font-size: 11px;
    font-weight: 800;
    color: #64748B;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 10px;
  }
  .method-chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #FFF1F3;
    border: 1.5px solid #FF1840;
    border-radius: 14px;
    padding: 12px 14px;
    margin-bottom: 22px;
  }
  .method-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .method-icon {
    width: 28px;
    height: 28px;
    background: #FF1840;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 13px;
    font-weight: bold;
  }
  .method-name {
    font-size: 13px;
    font-weight: 700;
    color: #0F172A;
  }
  .method-sub {
    font-size: 11px;
    color: #64748B;
  }
  .method-check {
    width: 20px;
    height: 20px;
    background: #FF1840;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 11px;
    font-weight: bold;
  }
  .btn-approve {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 15px;
    background: linear-gradient(135deg, #FF1840 0%, #D00F31 100%);
    color: #FFFFFF;
    border: none;
    border-radius: 16px;
    font-family: inherit;
    font-size: 15px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(255, 24, 64, 0.35);
    transition: all 0.2s;
  }
  .btn-approve:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 28px rgba(255, 24, 64, 0.45);
  }
  .btn-approve:active {
    transform: scale(0.98);
  }
  .btn-decline {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 12px;
    background: transparent;
    color: #64748B;
    border: 1px solid #E2E8F0;
    border-radius: 14px;
    font-family: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    margin-top: 10px;
    transition: all 0.2s;
  }
  .btn-decline:hover {
    background: #F8FAFC;
    color: #DC2626;
    border-color: #FECACA;
  }
  .footer-trust {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid #F1F5F9;
    text-align: center;
  }
  .trust-text {
    font-size: 11px;
    color: #94A3B8;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    margin-bottom: 6px;
    font-weight: 600;
  }
  .trust-pills {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 10px;
    font-weight: 800;
    color: #64748B;
  }
  .trust-pill {
    background: #F1F5F9;
    padding: 3px 8px;
    border-radius: 6px;
  }
  @keyframes cardIn {
    from { opacity: 0; transform: translateY(18px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
</style>
</head>
<body>
<div class="checkout-card">
  <div class="card-top-bar"></div>
  <div class="header">
    <div class="logo-wrap">
      <div class="logo-badge">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4C2.9 6 1.9 6.8 1.6 7.8L.2 12.8c-.1.4-.2.8-.2 1.2 0 .4.1.8.2 1.2.3 1.1.8 2.8.8 2.8h3"/>
          <circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>
        </svg>
      </div>
      <div class="logo-text">BusGo <span>South</span></div>
    </div>
    <div class="sec-badge">
      <span class="sec-dot"></span>
      <span>256-Bit SSL</span>
    </div>
  </div>

  <div class="amount-card">
    <div class="amount-label">Amount Payable</div>
    <div class="amount-val"><span class="amount-curr">₹</span>${esc(amount)}</div>
    <div class="order-pill">
      <span>Order ID:</span>
      <b>${esc(ref)}</b>
    </div>
  </div>

  <div class="details-box">
    <div class="detail-row">
      <span class="detail-key">Merchant</span>
      <span class="detail-val">BusGo South Express</span>
    </div>
    <div class="detail-row">
      <span class="detail-key">Purpose</span>
      <span class="detail-val">Bus Ticket Reservation</span>
    </div>
    <div class="detail-row">
      <span class="detail-key">Guarantee</span>
      <span class="detail-val" style="color:#059669">Guaranteed Seats ✓</span>
    </div>
  </div>

  <div class="methods-title">Simulated Payment Method</div>
  <div class="method-chip">
    <div class="method-left">
      <div class="method-icon">₹</div>
      <div>
        <div class="method-name">UPI Instant Payment</div>
        <div class="method-sub">GPay • PhonePe • Paytm • BHIM</div>
      </div>
    </div>
    <div class="method-check">✓</div>
  </div>

  <form method="POST" action="/mock-gateway/decide" id="approve-form">
    <input type="hidden" name="ref" value="${esc(ref)}"/>
    <input type="hidden" name="amount" value="${esc(amount)}"/>
    <input type="hidden" name="callback" value="${esc(callback)}"/>
    <input type="hidden" name="return_url" value="${esc(return_url)}"/>
    <input type="hidden" name="sig" value="${esc(sig)}"/>
    <input type="hidden" name="decision" value="success"/>
    <button type="submit" class="btn-approve" id="approve-btn">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <span>Approve &amp; Pay ₹${esc(amount)}</span>
    </button>
  </form>

  <form method="POST" action="/mock-gateway/decide" id="decline-form">
    <input type="hidden" name="ref" value="${esc(ref)}"/>
    <input type="hidden" name="amount" value="${esc(amount)}"/>
    <input type="hidden" name="callback" value="${esc(callback)}"/>
    <input type="hidden" name="return_url" value="${esc(return_url)}"/>
    <input type="hidden" name="sig" value="${esc(sig)}"/>
    <input type="hidden" name="decision" value="failed"/>
    <button type="submit" class="btn-decline">
      Decline Payment
    </button>
  </form>

  <div class="footer-trust">
    <div class="trust-text">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      PCI DSS Certified • Bank Grade Encryption
    </div>
    <div class="trust-pills">
      <span class="trust-pill">UPI</span>
      <span class="trust-pill">RuPay</span>
      <span class="trust-pill">VISA</span>
      <span class="trust-pill">Mastercard</span>
    </div>
  </div>
</div>

<script>
  document.getElementById('approve-form').addEventListener('submit', function() {
    var btn = document.getElementById('approve-btn');
    btn.disabled = true;
    btn.style.opacity = '0.85';
    btn.innerHTML = '<span>Processing Payment...</span>';
  });
</script>
</body>
</html>`);
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
