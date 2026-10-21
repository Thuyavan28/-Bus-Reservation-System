import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import { env } from '../config/env';
import { Booking, BookingPassenger, Payment, Trip, City } from '../models';
import { HttpError } from '../utils/http';
import { audit } from './audit';
import { confirmBooking, handleSeatsLost, SeatsLostError } from './bookingService';
import { enqueueEmail } from './email';
import { publicAppOrigin } from '../utils/network';
import { releaseHold } from './seatService';
import { completeRefund, signPayload } from './refundService';

/**
 * Creates (or returns) the payment for a booking and the URL of the external payment website the
 * browser must be redirected to. Idempotent per Idempotency-Key.
 */
export async function initiatePayment(opts: { userId: string; bookingId: string; idempotencyKey: string; origin?: string | null;}) {
  const booking = await Booking.findOne({ _id: opts.bookingId, userId: opts.userId });
  if (!booking) throw new HttpError(404, 'BOOKING_NOT_FOUND');

  let payment = await Payment.findOne({ idempotencyKey: opts.idempotencyKey });
  if (!payment) {
    if (booking.status !== 'pending_payment') throw new HttpError(409, 'BAD_STATUS', `Booking is ${booking.status}`);
    if (booking.holdExpiresAt && booking.holdExpiresAt <= new Date()) throw new HttpError(409, 'HOLD_EXPIRED', 'Your seat hold expired');
    // a retry after a failed attempt creates a new payment; a live one is reused
    payment = await Payment.findOne({ bookingId: booking._id, status: 'created' });
    if (!payment) {
      payment = await Payment.create({
        bookingId: booking._id,
        userId: opts.userId,
        amount: booking.price!.total,
        reference: `PAY-${nanoid(14)}`,
        idempotencyKey: opts.idempotencyKey,
        approvalToken: nanoid(32),
      });
      await audit('payment.created', { actorId: opts.userId, bookingId: booking._id, data: { reference: payment.reference, amount: payment.amount } });
    }
  }
  if (!payment.approvalToken) {
    payment.approvalToken = nanoid(32);
    await payment.save();
  }
  const { url: approveUrl, reachable } = approvalUrl(payment.approvalToken, opts.origin);
  // the QR carries the approval link: scanning it opens the accept / reject page on the payer's phone
  const qr = await QRCode.toDataURL(approveUrl, { margin: 1, width: 360, color: { dark: '#06302D', light: '#FFFFFF' } });
  return { payment, redirectUrl: buildRedirectUrl(payment.reference, payment.amount), approveUrl, qr, reachable };
}

/**
 * Link encoded in the payment QR. It is built from PUBLIC_APP_URL, else from the page the buyer is on, so it works
 * on whatever domain or network the app is served from; localhost is replaced by this machine's LAN address so a
 * phone on the same Wi-Fi can open it.
 */
export function approvalUrl(token: string, requestOrigin?: string | null) {
  const { origin, reachable } = publicAppOrigin({ configured: env.PUBLIC_APP_URL, requestOrigin, fallback: env.CLIENT_URL });
  return { url: `${origin}/pay/approve/${token}`, reachable };
}

/** What the scanned approval page shows. The token is the only credential. */
export async function approvalSummary(token: string) {
  const payment = await Payment.findOne({ approvalToken: token });
  if (!payment) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'This payment link is not valid');
  const booking = await Booking.findById(payment.bookingId).lean();
  if (!booking) throw new HttpError(404, 'PAYMENT_NOT_FOUND');
  const [trip, seats] = await Promise.all([Trip.findById(booking.tripId).lean(), BookingPassenger.find({ bookingId: booking._id }).select('seatLabel').lean()]);
  const [from, to] = trip ? await Promise.all([City.findById(trip.fromCityId).lean(), City.findById(trip.toCityId).lean()]) : [null, null];
  const expired = booking.status === 'pending_payment' && !!booking.holdExpiresAt && booking.holdExpiresAt <= new Date();
  return {
    merchant: 'BusGo South',
    reference: payment.reference,
    amount: payment.amount,
    status: expired && payment.status === 'created' ? 'expired' : payment.status,
    route: from && to ? `${from.name} to ${to.name}` : '',
    departureTime: trip?.departureTime ?? null,
    seats: seats.map((s) => s.seatLabel),
    expiresAt: booking.holdExpiresAt,
    pnr: payment.status === 'success' ? booking.pnr : undefined,
  };
}

/** Accept: places the order (same atomic confirm as the webhook). Reject: payment fails, seats are released. */
export async function decideByToken(token: string, decision: 'accept' | 'reject') {
  const payment = await Payment.findOne({ approvalToken: token });
  if (!payment) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'This payment link is not valid');
  const booking = await Booking.findById(payment.bookingId);
  if (!booking) throw new HttpError(404, 'PAYMENT_NOT_FOUND');

  if (decision === 'accept') {
    if (payment.status === 'success') return { status: 'success', duplicate: true };
    if (payment.status === 'failed') throw new HttpError(409, 'PAYMENT_REJECTED', 'This payment was already rejected');
    if (booking.status === 'pending_payment' && booking.holdExpiresAt && booking.holdExpiresAt <= new Date())
      throw new HttpError(410, 'PAYMENT_EXPIRED', 'The seat hold expired. Please start the booking again.');
    const r = await applyWebhook({ eventId: `qr-${payment.reference}`, reference: payment.reference, status: 'success', amount: payment.amount, gatewayTxnId: `QR-${payment.reference}` });
    return { status: 'success', duplicate: r.duplicate };
  }

  if (payment.status === 'success') throw new HttpError(409, 'PAYMENT_ACCEPTED', 'This payment was already accepted');
  if (payment.status === 'failed') return { status: 'failed', duplicate: true };
  const claimed = await Payment.findOneAndUpdate({ _id: payment._id, status: 'created' }, { $set: { status: 'failed', failureReason: 'Rejected by payer' } }, { new: true });
  if (!claimed) return { status: 'failed', duplicate: true };
  booking.status = 'payment_failed';
  await booking.save();
  await releaseHold(booking.holdId);
  await audit('payment.rejected', { bookingId: booking._id, tripId: booking.tripId, data: { reference: payment.reference } });
  await enqueueEmail(booking.contact!.email!, 'payment_failed', booking._id, { reason: 'the payment was rejected and the order was removed' }, `payreject:${payment._id}`);
  return { status: 'failed', duplicate: false };
}

export function buildRedirectUrl(reference: string, amount: number) {
  const base = env.EXTERNAL_PAYMENT_URL || `${env.SERVER_PUBLIC_URL}/mock-gateway`;
  const u = new URL(base);
  u.searchParams.set('ref', reference);
  u.searchParams.set('amount', String(amount));
  u.searchParams.set('callback', `${env.SERVER_PUBLIC_URL}/api/payments/webhook`);
  u.searchParams.set('return_url', `${env.CLIENT_URL}/payment/return?ref=${reference}`);
  u.searchParams.set('sig', signPayload(`${reference}|${amount}`));
  return u.toString();
}

export interface WebhookEvent {
  eventId: string;
  type?: 'payment' | 'refund';
  reference: string;
  status: 'success' | 'failed';
  gatewayTxnId?: string;
  amount?: number;
  reason?: string;
}

/**
 * Safe to retry: each eventId is claimed atomically, so a replayed webhook (or a second event for an
 * already-successful payment) never confirms or refunds twice.
 */
export async function applyWebhook(ev: WebhookEvent): Promise<{ duplicate: boolean; booking?: string }> {
  if (ev.type === 'refund') {
    const done = await completeRefund(ev.reference, ev.gatewayTxnId);
    return { duplicate: !done };
  }
  const payment = await Payment.findOneAndUpdate(
    { reference: ev.reference, processedEvents: { $ne: ev.eventId } },
    { $push: { processedEvents: ev.eventId } },
    { new: true },
  );
  if (!payment) {
    if (await Payment.exists({ reference: ev.reference })) return { duplicate: true };
    throw new HttpError(404, 'PAYMENT_NOT_FOUND');
  }
  if (ev.amount != null && ev.amount !== payment.amount) throw new HttpError(400, 'AMOUNT_MISMATCH');
  const bookingId = String(payment.bookingId);

  if (ev.status === 'failed') {
    if (payment.status === 'created') {
      payment.status = 'failed';
      payment.failureReason = ev.reason;
      await payment.save();
      await audit('payment.failed', { bookingId, data: { reference: ev.reference, reason: ev.reason } });
      const b = await Booking.findById(bookingId).lean();
      if (b) await enqueueEmail(b.contact!.email!, 'payment_failed', bookingId, { reason: ev.reason }, `payfail:${payment._id}:${ev.eventId}`);
    }
    return { duplicate: false, booking: bookingId };
  }

  if (payment.status === 'success') return { duplicate: true, booking: bookingId };
  if (ev.gatewayTxnId) {
    const clash = await Payment.exists({ gatewayTxnId: ev.gatewayTxnId, _id: { $ne: payment._id } });
    if (clash) throw new HttpError(409, 'DUPLICATE_TXN');
    payment.gatewayTxnId = ev.gatewayTxnId;
  }
  payment.status = 'success';
  await payment.save();
  await audit('payment.success', { bookingId, data: { reference: ev.reference, gatewayTxnId: ev.gatewayTxnId } });
  try {
    await confirmBooking(bookingId);
  } catch (e) {
    if (e instanceof SeatsLostError) await handleSeatsLost(bookingId, e.message);
    else throw e;
  }
  return { duplicate: false, booking: bookingId };
}
