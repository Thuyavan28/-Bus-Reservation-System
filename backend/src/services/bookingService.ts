import mongoose, { type ClientSession } from 'mongoose';
import { customAlphabet, nanoid } from 'nanoid';
import type { Gender } from '@busgo/shared';
import { Booking, BookingPassenger, CancellationRequest, Notification, Payment, Refund, SeatInventory, User } from '../models';
import { HttpError } from '../utils/http';
import { audit } from './audit';
import { arrivalFrom, getRouteInfo } from './distance';
import { enqueueEmail } from './email';
import { priceBreakdown, refundBreakdown } from './money';
import { eligibilityCheck, holdUnset, loadState } from './seatService';
import { startRefund } from './refundService';

const pnrId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

export interface PassengerInput {
  seatId: string;
  name: string;
  age: number;
  gender: Gender;
  familyLinked?: boolean;
}
export interface CreateBookingInput {
  userId: string;
  tripId: string;
  holdId: string;
  boardingPointId: string;
  droppingPointId: string;
  passengers: PassengerInput[];
  contact: { name: string; email: string; phone: string };
}

const familyId = (userId: string, linked?: boolean) => (linked ? `family:${userId}` : null);

/** Creates a pending_payment booking from an active hold. Idempotent per holdId. */
export async function createBooking(input: CreateBookingInput) {
  const existing = await Booking.findOne({ holdId: input.holdId, userId: input.userId });
  if (existing) return existing;

  const held = await SeatInventory.find({ tripId: input.tripId, holdId: input.holdId, holdUserId: input.userId }).lean();
  const now = new Date();
  if (held.length === 0 || held.some((h) => !h.holdExpiresAt || h.holdExpiresAt <= now))
    throw new HttpError(409, 'HOLD_EXPIRED', 'Your seat hold expired. Please select seats again.');
  const heldIds = new Set(held.map((h) => h.seatId));
  if (input.passengers.length !== heldIds.size || input.passengers.some((p) => !heldIds.has(p.seatId)))
    throw new HttpError(400, 'PASSENGER_SEAT_MISMATCH', 'Passenger details must match the held seats');
  for (const p of input.passengers) {
    const h = held.find((x) => x.seatId === p.seatId)!;
    if (h.holdGender !== p.gender) throw new HttpError(400, 'GENDER_MISMATCH', `Seat ${p.seatId} was held for a ${h.holdGender} passenger`);
  }

  const state = await loadState(input.tripId, { ownHoldId: input.holdId });
  const chk = eligibilityCheck(state, input.passengers.map((p) => ({ seatId: p.seatId, gender: p.gender, familyGroupId: familyId(input.userId, p.familyLinked) })), input.holdId);
  if (!chk.ok) throw new HttpError(409, 'NOT_ELIGIBLE', 'Seats are no longer valid', chk.violations);

  const { trip, bus } = state;
  const board = trip.boarding.find((b: any) => b.pointId === input.boardingPointId);
  const drop = trip.dropping.find((b: any) => b.pointId === input.droppingPointId);
  if (!board || !drop) throw new HttpError(400, 'BAD_POINTS', 'Pick a valid boarding and dropping point');

  const seatDefs = new Map<string, any>(bus.layout.decks.flatMap((d: any) => d.seats.map((s: any) => [s.id, s])));
  const fares = input.passengers.map((p) => trip.fares[seatDefs.get(p.seatId).type as 'seater' | 'sleeper']);
  const price = priceBreakdown(fares);
  const route = await getRouteInfo(String(trip.fromCityId), String(trip.toCityId));
  const arrival = route.available ? arrivalFrom(trip.departureTime, route.durationMin) : null;

  const booking = await Booking.create({
    pnr: pnrId(),
    userId: input.userId,
    tripId: input.tripId,
    operatorId: trip.operatorId,
    holdId: input.holdId,
    groupId: input.holdId,
    holdExpiresAt: held[0].holdExpiresAt,
    boardingPointId: input.boardingPointId,
    droppingPointId: input.droppingPointId,
    contact: input.contact,
    price,
    distanceKm: route.distanceKm,
    estimateSource: route.available ? route.source : undefined,
    durationMin: route.durationMin,
    arrivalTime: arrival,
  });
  await BookingPassenger.insertMany(
    input.passengers.map((p, i) => ({
      bookingId: booking._id,
      tripId: input.tripId,
      seatId: p.seatId,
      seatLabel: seatDefs.get(p.seatId).label,
      name: p.name,
      age: p.age,
      gender: p.gender,
      fare: fares[i],
      familyGroupId: familyId(input.userId, p.familyLinked),
      active: false,
    })),
  );
  await audit('booking.created', { actorId: input.userId, bookingId: booking._id, tripId: input.tripId, data: { price, seats: [...heldIds] } });
  return booking;
}

export class SeatsLostError extends Error {}

/**
 * Atomic all-or-nothing confirmation after a successful payment. Re-runs eligibility inside the
 * transaction. If a replacement books a seat awaiting cancellation, the original booking is finalised here.
 * Idempotent: confirming an already-booked booking is a no-op.
 */
export async function confirmBooking(bookingId: string) {
  const replaced: string[] = [];
  let confirmed = false;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      replaced.length = 0;
      confirmed = false;
      const booking = await Booking.findById(bookingId).session(session);
      if (!booking) throw new HttpError(404, 'BOOKING_NOT_FOUND');
      if (booking.status === 'booked') return;
      if (!['pending_payment', 'payment_failed', 'expired'].includes(booking.status))
        throw new HttpError(409, 'BAD_STATUS', `Booking is ${booking.status}`);

      const bps = await BookingPassenger.find({ bookingId }).session(session);
      const state = await loadState(String(booking.tripId), { ownHoldId: booking.holdId, session });
      const now = new Date();
      // Seats are ours if still under our hold, or (hold lapsed) nobody else took them.
      const check = eligibilityCheck(state, bps.map((p) => ({ seatId: p.seatId, gender: p.gender as Gender, familyGroupId: p.familyGroupId })), booking.holdId);
      // eligibilityCheck on a lapsed hold treats unowned open seats as open, others as taken
      if (!check.ok) throw new SeatsLostError(JSON.stringify(check.violations));

      for (const p of bps) {
        const r = await SeatInventory.findOneAndUpdate(
          {
            tripId: booking.tripId,
            seatId: p.seatId,
            status: { $in: ['available', 'cancellation_pending'] },
            $or: [{ holdId: booking.holdId }, { holdId: { $exists: false } }, { holdId: null }, { holdExpiresAt: { $lte: now } }],
          },
          {
            $set: { status: 'booked', bookingId: booking._id, passengerGender: p.gender, groupId: booking.groupId, familyGroupId: p.familyGroupId ?? null },
            $unset: { ...holdUnset(), pendingCancelBookingId: '' },
          },
          { session },
        );
        if (!r) throw new SeatsLostError(`seat ${p.seatId}`);
        if (r.pendingCancelBookingId) {
          replaced.push(String(r.pendingCancelBookingId));
          // free the seat's unique (tripId, seatId, active) slot for the replacement passenger
          await BookingPassenger.updateMany({ bookingId: r.pendingCancelBookingId, seatId: p.seatId }, { $set: { active: false } }, { session });
        }
      }
      await BookingPassenger.updateMany({ bookingId }, { $set: { active: true } }, { session });
      booking.status = 'booked';
      await booking.save({ session });
      await audit('booking.confirmed', { actorId: booking.userId, bookingId, tripId: booking.tripId, data: { seats: bps.map((p) => p.seatId) } }, session);
      confirmed = true;
      for (const orig of new Set(replaced)) await finalizeReplaced(orig, bookingId, session);
    });
  } finally {
    await session.endSession();
  }
  if (confirmed) {
    const b = await Booking.findById(bookingId).lean();
    if (b) {
      await enqueueEmail(b.contact!.email!, 'booking_confirmation', bookingId, {}, `confirm:${bookingId}`);
      await Notification.create({ userId: b.userId, title: 'Booking confirmed', body: `PNR ${b.pnr}`, kind: 'booking', bookingId });
    }
    for (const orig of new Set(replaced)) await afterReplacement(orig);
  }
  return Booking.findById(bookingId);
}

/** Inside the confirm transaction: a replacement has taken (some of) the original booking's seats. */
async function finalizeReplaced(origId: string, byBookingId: string, session: ClientSession) {
  const stillPending = await SeatInventory.countDocuments({ pendingCancelBookingId: origId }).session(session);
  if (stillPending > 0) {
    // Whole-booking cancellation: wait until every seat of the original has been replaced.
    return;
  }
  const claimed = await CancellationRequest.findOneAndUpdate({ bookingId: origId, status: 'pending' }, { $set: { status: 'replaced', resolvedAt: new Date() } }, { session, new: true });
  if (!claimed) return;
  const orig = await Booking.findById(origId).session(session);
  if (!orig) return;
  await BookingPassenger.updateMany({ bookingId: origId }, { $set: { active: false } }, { session });
  const payment = await Payment.findOne({ bookingId: origId, status: 'success' }).session(session);
  const calc = refundBreakdown(claimed.ticketAmount!, claimed.fee!);
  await audit('booking.cancelled', { bookingId: origId, tripId: orig.tripId, data: { reason: 'replacement_booked', replacedBy: byBookingId } }, session);
  if (calc.refund > 0) {
    orig.status = 'refund_processing';
    await Refund.create(
      [{ bookingId: origId, paymentId: payment?._id, reference: `RFD-${nanoid(12)}`, ticketAmount: calc.ticketAmount, deduction: calc.deduction, amount: calc.refund, status: 'processing' }],
      { session },
    );
    await audit('refund.created', { bookingId: origId, data: calc }, session);
  } else {
    orig.status = 'cancelled';
  }
  await orig.save({ session });
  await CancellationRequest.updateOne({ _id: claimed._id }, { $set: { refundAmount: calc.refund } }, { session });
}

async function afterReplacement(origId: string) {
  const orig = await Booking.findById(origId).lean();
  const cr = await CancellationRequest.findOne({ bookingId: origId }).lean();
  if (!orig || !cr || cr.status !== 'replaced') return;
  await enqueueEmail(orig.contact!.email!, 'cancellation_completed', origId, { ticketAmount: cr.ticketAmount, deduction: cr.fee, refundAmount: cr.refundAmount }, `cancelled:${origId}`);
  await Notification.create({ userId: orig.userId, title: 'Booking cancelled', body: `Seat replaced. Refund ₹${cr.refundAmount} is processing.`, kind: 'cancellation', bookingId: origId });
  const refund = await Refund.findOne({ bookingId: origId });
  if (refund) await startRefund(String(refund._id));
}

/** Payment came in but seats are gone: expire the booking and refund everything. */
export async function handleSeatsLost(bookingId: string, reason: string) {
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.status === 'booked') return;
  const payment = await Payment.findOne({ bookingId, status: 'success' });
  booking.status = 'refund_processing';
  await booking.save();
  const refund = await Refund.create({
    bookingId,
    paymentId: payment?._id,
    reference: `RFD-${nanoid(12)}`,
    ticketAmount: booking.price!.total,
    deduction: 0,
    amount: booking.price!.total,
  });
  await audit('booking.seats_lost', { bookingId, data: { reason } });
  await enqueueEmail(booking.contact!.email!, 'payment_failed', bookingId, { reason: 'seats were no longer available; a full refund has been started' });
  await startRefund(String(refund._id));
}

/** Cron: pending_payment bookings whose hold ran out. */
export async function expireUnpaidBookings() {
  const rows = await Booking.find({ status: 'pending_payment', holdExpiresAt: { $lte: new Date(Date.now() - 60_000) } });
  for (const b of rows) {
    const paid = await Payment.exists({ bookingId: b._id, status: 'success' });
    if (paid) continue;
    b.status = 'expired';
    await b.save();
    await audit('booking.expired', { bookingId: b._id });
  }
  return rows.length;
}

export async function getUserBookings(userId: string) {
  const u = await User.findById(userId).lean();
  return u ? Booking.find({ userId }).sort({ createdAt: -1 }).lean() : [];
}
