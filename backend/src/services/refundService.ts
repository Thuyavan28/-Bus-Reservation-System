import crypto from 'crypto';
import { env } from '../config/env';
import { Booking, Notification, Refund } from '../models';
import { audit } from './audit';
import { enqueueEmail } from './email';

export const signPayload = (raw: string) => crypto.createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET).update(raw).digest('hex');

/**
 * Starts a refund with the external payment website (if EXTERNAL_REFUND_URL is set). The refund stays
 * "processing" until the site confirms through the signed webhook, or an operator marks it complete.
 */
export async function startRefund(refundId: string) {
  const refund = await Refund.findById(refundId);
  if (!refund || refund.status !== 'processing') return;
  await audit('refund.started', { bookingId: refund.bookingId, data: { reference: refund.reference, amount: refund.amount } });
  if (!env.EXTERNAL_REFUND_URL) return;
  const body = JSON.stringify({
    reference: refund.reference,
    amount: refund.amount,
    callback: `${env.SERVER_PUBLIC_URL}/api/payments/webhook`,
  });
  try {
    const res = await fetch(env.EXTERNAL_REFUND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': signPayload(body), 'Idempotency-Key': refund.reference },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`refund provider ${res.status}`);
  } catch (e) {
    await audit('refund.start_failed', { bookingId: refund.bookingId, data: { error: (e as Error).message } });
    console.warn('[refund] provider call failed, left in processing:', (e as Error).message);
  }
}

/** Idempotent: completing an already-completed refund is a no-op. */
export async function completeRefund(reference: string, gatewayRefundId?: string) {
  const refund = await Refund.findOneAndUpdate({ reference, status: 'processing' }, { $set: { status: 'completed', gatewayRefundId } }, { new: true });
  if (!refund) return null;
  const booking = await Booking.findByIdAndUpdate(refund.bookingId, { $set: { status: 'refund_completed' } }, { new: true });
  await audit('refund.completed', { bookingId: refund.bookingId, data: { reference, amount: refund.amount } });
  if (booking) {
    await enqueueEmail(booking.contact!.email!, 'refund_completed', booking._id, { refundId: refund._id }, `refund:${refund._id}`);
    await Notification.create({ userId: booking.userId, title: 'Refund completed', body: `₹${refund.amount} refunded`, kind: 'refund', bookingId: booking._id });
  }
  return refund;
}
