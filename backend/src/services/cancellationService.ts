import mongoose from 'mongoose';
import { nanoid } from 'nanoid';
import { Booking, BookingPassenger, CancellationRequest, Notification, Operator, Payment, Refund, SeatInventory, Trip } from '../models';
import { HttpError } from '../utils/http';
import { audit } from './audit';
import { enqueueEmail } from './email';
import { refundBreakdown, standardTermsRefund } from './money';
import { startRefund } from './refundService';

async function context(bookingId: string, userId?: string) {
  const booking = await Booking.findOne(userId ? { _id: bookingId, userId } : { _id: bookingId });
  if (!booking) throw new HttpError(404, 'BOOKING_NOT_FOUND');
  const [trip, operator] = await Promise.all([Trip.findById(booking.tripId).lean(), Operator.findById(booking.operatorId).lean()]);
  if (!trip || !operator) throw new HttpError(404, 'TRIP_NOT_FOUND');
  return { booking, trip, operator };
}

export function cutoffFor(departure: Date, cutoffHours: number, now = new Date()) {
  const c = new Date(departure.getTime() - cutoffHours * 3_600_000);
  return c > now ? c : departure; // already past the cutoff window -> wait until departure
}

/** Shown to the passenger BEFORE they submit. */
export async function cancellationPreview(bookingId: string, userId: string) {
  const { booking, trip, operator } = await context(bookingId, userId);
  const p = operator.policy!;
  const calc = refundBreakdown(booking.price!.total!, p.cancellationFee ?? 50);
  return {
    ticketAmount: calc.ticketAmount,
    fee: calc.deduction,
    refundAmount: calc.refund,
    cutoffAt: cutoffFor(trip.departureTime, p.cutoffHoursBeforeDeparture ?? 2),
    fallbackPolicy: p.fallbackPolicy,
    standardRefundPercent: p.standardRefundPercent,
    cancellable: booking.status === 'booked' && trip.departureTime > new Date(),
    status: booking.status,
  };
}

export async function requestCancellation(bookingId: string, userId: string) {
  const { booking, trip, operator } = await context(bookingId, userId);
  const existing = await CancellationRequest.findOne({ bookingId });
  if (existing) return existing; // idempotent
  if (booking.status !== 'booked') throw new HttpError(409, 'NOT_CANCELLABLE', `Booking is ${booking.status}`);
  if (trip.departureTime <= new Date()) throw new HttpError(409, 'DEPARTED', 'This trip has already departed');
  const p = operator.policy!;
  const calc = refundBreakdown(booking.price!.total!, p.cancellationFee ?? 50);
  const cutoffAt = cutoffFor(trip.departureTime, p.cutoffHoursBeforeDeparture ?? 2);

  const session = await mongoose.startSession();
  let request: any;
  try {
    await session.withTransaction(async () => {
      const [cr] = await CancellationRequest.create(
        [{ bookingId, userId, ticketAmount: calc.ticketAmount, fee: calc.deduction, refundAmount: calc.refund, cutoffAt }],
        { session },
      );
      request = cr;
      booking.status = 'cancellation_pending';
      await booking.save({ session });
      // Seats stay occupied (not released) but become purchasable by a replacement passenger.
      await SeatInventory.updateMany(
        { tripId: booking.tripId, bookingId },
        { $set: { status: 'cancellation_pending', pendingCancelBookingId: booking._id } },
        { session },
      );
      await audit('cancellation.requested', { actorId: userId, bookingId, tripId: booking.tripId, data: calc }, session);
    });
  } finally {
    await session.endSession();
  }
  await enqueueEmail(booking.contact!.email!, 'cancellation_pending', bookingId, {
    ticketAmount: calc.ticketAmount,
    fee: calc.deduction,
    refundAmount: calc.refund,
    cutoffAt,
    fallbackPolicy: p.fallbackPolicy,
  }, `cancelreq:${bookingId}`);
  await Notification.create({ userId, title: 'Cancellation pending', body: 'Awaiting a replacement booking for your seat.', kind: 'cancellation', bookingId });
  return request;
}

/** Cron: apply the operator's fallback once the cutoff passes with no replacement. */
export async function applyCancellationFallbacks(now = new Date()) {
  const due = await CancellationRequest.find({ status: 'pending', cutoffAt: { $lte: now } }).lean();
  let n = 0;
  for (const r of due) {
    const claimed = await CancellationRequest.findOneAndUpdate({ _id: r._id, status: 'pending' }, { $set: { resolvedAt: now } }, { new: true });
    if (!claimed) continue;
    const { booking, operator } = await context(String(r.bookingId));
    if (booking.status !== 'cancellation_pending') continue;
    const p = operator.policy!;
    const session = await mongoose.startSession();
    let refundId: unknown = null;
    let outcome: 'rejected' | 'standard' = 'rejected';
    let calc = { ticketAmount: r.ticketAmount!, deduction: 0, refund: 0 };
    try {
      await session.withTransaction(async () => {
        refundId = null;
        if (p.fallbackPolicy === 'reject') {
          outcome = 'rejected';
          await CancellationRequest.updateOne({ _id: r._id }, { $set: { status: 'rejected', refundAmount: 0 } }, { session });
          booking.status = 'booked';
          await booking.save({ session });
          await SeatInventory.updateMany({ bookingId: booking._id }, { $set: { status: 'booked' }, $unset: { pendingCancelBookingId: '' } }, { session });
          await audit('cancellation.rejected', { bookingId: booking._id, tripId: booking.tripId, data: { reason: 'no_replacement_by_cutoff' } }, session);
        } else {
          outcome = 'standard';
          calc = standardTermsRefund(r.ticketAmount!, p.standardRefundPercent ?? 50);
          await CancellationRequest.updateOne({ _id: r._id }, { $set: { status: 'standard_terms', refundAmount: calc.refund, fee: calc.deduction } }, { session });
          // release seats, but do not clobber a replacement hold in progress
          await SeatInventory.updateMany(
            { bookingId: booking._id },
            { $set: { status: 'available' }, $unset: { bookingId: '', pendingCancelBookingId: '', passengerGender: '', groupId: '', familyGroupId: '' } },
            { session },
          );
          await BookingPassenger.updateMany({ bookingId: booking._id }, { $set: { active: false } }, { session });
          const payment = await Payment.findOne({ bookingId: booking._id, status: 'success' }).session(session);
          if (calc.refund > 0) {
            booking.status = 'refund_processing';
            const [rf] = await Refund.create(
              [{ bookingId: booking._id, paymentId: payment?._id, reference: `RFD-${nanoid(12)}`, ticketAmount: calc.ticketAmount, deduction: calc.deduction, amount: calc.refund }],
              { session },
            );
            refundId = rf._id;
          } else booking.status = 'cancelled';
          await booking.save({ session });
          await audit('cancellation.standard_terms', { bookingId: booking._id, tripId: booking.tripId, data: calc }, session);
        }
      });
    } finally {
      await session.endSession();
    }
    await enqueueEmail(booking.contact!.email!, 'cancellation_final', booking._id, {
      outcome,
      ticketAmount: calc.ticketAmount,
      deduction: calc.deduction,
      refundAmount: calc.refund,
    }, `cancelfinal:${booking._id}`);
    await Notification.create({
      userId: booking.userId,
      title: outcome === 'rejected' ? 'Cancellation rejected' : 'Cancellation finalised',
      body: outcome === 'rejected' ? 'No replacement found; your booking stays confirmed.' : `Refund ₹${calc.refund}`,
      kind: 'cancellation',
      bookingId: booking._id,
    });
    if (refundId) await startRefund(String(refundId));
    n++;
  }
  return n;
}
