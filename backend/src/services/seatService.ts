import type { ClientSession } from 'mongoose';
import { nanoid } from 'nanoid';
import type { BusLayout, Gender } from '@busgo/shared';
import { Bus, Operator, SeatInventory, Trip } from '../models';
import { HttpError } from '../utils/http';
import { audit } from './audit';
import {
  allowedGendersFor,
  validateSeatEligibility,
  type GenderPolicy,
  type Occupancy,
  type Selection,
} from './seatEligibility';

export const DEFAULT_GENDER_POLICY: GenderPolicy = { enforce: true, femaleAdjacentRestricted: true, allowSameBookingAdjacent: true };
export const MAX_SEATS_PER_HOLD = 6;

export async function ensureInventory(tripId: unknown, layout: BusLayout) {
  const docs = layout.decks.flatMap((d) =>
    d.seats.map((s) => ({ tripId, seatId: s.id, ladiesOnly: !!s.ladiesOnly })),
  );
  if (docs.length) await SeatInventory.insertMany(docs, { ordered: false });
}

const holdActive = (r: { holdId?: string | null; holdExpiresAt?: Date | null }, now: Date) =>
  !!r.holdId && !!r.holdExpiresAt && r.holdExpiresAt > now;

export interface TripState {
  trip: any;
  bus: any;
  operator: any;
  layout: BusLayout;
  policy: GenderPolicy;
  occupancy: Occupancy;
  openSeats: Set<string>;
  ladiesOnly: Set<string>;
  rows: any[];
}

/** Loads inventory and derives the sets validateSeatEligibility() needs. Own hold seats count as open. */
export async function loadState(tripId: string, opts: { ownHoldId?: string; session?: ClientSession | null } = {}): Promise<TripState> {
  const q = (x: any) => (opts.session ? x.session(opts.session) : x);
  const trip = await q(Trip.findById(tripId)).lean();
  if (!trip) throw new HttpError(404, 'TRIP_NOT_FOUND');
  const [bus, operator, rows] = await Promise.all([
    q(Bus.findById(trip.busId)).lean(),
    q(Operator.findById(trip.operatorId)).lean(),
    q(SeatInventory.find({ tripId })).lean(),
  ]);
  if (!bus || !operator) throw new HttpError(404, 'TRIP_NOT_FOUND');
  const now = new Date();
  const occupancy: Occupancy = new Map();
  const openSeats = new Set<string>();
  const ladiesOnly = new Set<string>();
  for (const r of rows as any[]) {
    if (r.ladiesOnly) ladiesOnly.add(r.seatId);
    const own = !!opts.ownHoldId && r.holdId === opts.ownHoldId;
    const active = holdActive(r, now);
    const sellable = r.status === 'available' || r.status === 'cancellation_pending';
    if (own) {
      openSeats.add(r.seatId);
      continue;
    }
    if (sellable && !active) openSeats.add(r.seatId);
    if (active && r.holdGender) {
      occupancy.set(r.seatId, { gender: r.holdGender, groupId: r.holdId, familyGroupId: r.holdFamilyGroupId });
    } else if ((r.status === 'booked' || r.status === 'cancellation_pending') && r.passengerGender) {
      occupancy.set(r.seatId, { gender: r.passengerGender, groupId: r.groupId, familyGroupId: r.familyGroupId });
    }
  }
  return {
    trip,
    bus,
    operator,
    layout: bus.layout as unknown as BusLayout,
    policy: { ...DEFAULT_GENDER_POLICY, ...(operator.policy?.gender ?? {}) },
    occupancy,
    openSeats,
    ladiesOnly,
    rows,
  };
}

/** Reusable service required by the spec: called on hold AND again on booking confirmation. */
export function eligibilityCheck(state: TripState, selections: Selection[], groupId: string) {
  return validateSeatEligibility({
    layout: state.layout,
    occupancy: state.occupancy,
    openSeats: state.openSeats,
    ladiesOnly: state.ladiesOnly,
    policy: state.policy,
    selections,
    groupId,
  });
}

export function seatMapView(state: TripState) {
  const now = new Date();
  const byId = new Map((state.rows as any[]).map((r) => [r.seatId, r]));
  const seats: Record<string, { state: 'available' | 'waiting' | 'booked' | 'held' | 'unavailable'; ladiesOnly: boolean; allowedGenders: Gender[] }> = {};
  for (const [seatId, r] of byId) {
    const open = state.openSeats.has(seatId);
    // 'waiting' = cancelled by its passenger and awaiting a replacement booking (still bookable)
    const status: 'available' | 'waiting' | 'booked' | 'held' | 'unavailable' =
      r.status === 'unavailable'
        ? 'unavailable'
        : open
          ? r.status === 'cancellation_pending'
            ? 'waiting'
            : 'available'
          : holdActive(r, now)
            ? 'held'
            : 'booked';
    seats[seatId] = {
      state: status,
      ladiesOnly: state.ladiesOnly.has(seatId),
      allowedGenders: open
        ? (() => {
            const base = { layout: state.layout, occupancy: state.occupancy, openSeats: state.openSeats, ladiesOnly: state.ladiesOnly, policy: state.policy };
            return allowedGendersFor(base, seatId);
          })()
        : [],
    };
  }
  return seats;
}

export interface HoldInput {
  userId: string;
  tripId: string;
  selections: Selection[];
  replaceHoldId?: string;
}

export async function holdSeats({ userId, tripId, selections, replaceHoldId }: HoldInput) {
  if (selections.length < 1 || selections.length > MAX_SEATS_PER_HOLD)
    throw new HttpError(400, 'BAD_SEAT_COUNT', `Select 1-${MAX_SEATS_PER_HOLD} seats`);
  if (replaceHoldId) {
    // Validate the new selection against the current state (own hold counts as free) BEFORE releasing it,
    // so a refused change (e.g. a gender edit that breaks the seat rules) keeps the original seats.
    const pre = await loadState(tripId, { ownHoldId: replaceHoldId });
    const chk = eligibilityCheck(pre, selections, replaceHoldId);
    if (!chk.ok) throw new HttpError(409, 'NOT_ELIGIBLE', 'Selected seats are not available for you', chk.violations);
    await releaseHold(replaceHoldId, userId);
  }

  const state = await loadState(tripId);
  if (state.trip.departureTime <= new Date() || state.trip.status === 'cancelled')
    throw new HttpError(409, 'TRIP_CLOSED', 'This trip is no longer open for booking');
  const holdId = nanoid(16);
  const pre = eligibilityCheck(state, selections, holdId);
  if (!pre.ok) throw new HttpError(409, 'NOT_ELIGIBLE', 'Selected seats are not available for you', pre.violations);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + (state.operator.policy?.holdMinutes ?? 8) * 60_000);
  const got: string[] = [];
  for (const sel of selections) {
    // Optimistic atomic acquire: succeeds only if nobody else holds/owns the seat right now.
    const r = await SeatInventory.findOneAndUpdate(
      {
        tripId,
        seatId: sel.seatId,
        status: { $in: ['available', 'cancellation_pending'] },
        $or: [{ holdId: { $exists: false } }, { holdId: null }, { holdExpiresAt: { $lte: now } }],
      },
      {
        $set: { holdId, holdUserId: userId, holdExpiresAt: expiresAt, holdGender: sel.gender, holdFamilyGroupId: sel.familyGroupId ?? null },
      },
    );
    if (!r) {
      await SeatInventory.updateMany({ tripId, holdId }, { $unset: holdUnset() });
      throw new HttpError(409, 'SEAT_TAKEN', `Seat was just taken by someone else`, [{ seatId: sel.seatId, code: 'SEAT_TAKEN' }]);
    }
    got.push(sel.seatId);
  }
  // Re-validate now that our seats are locked: a neighbour may have been taken in the meantime.
  const post = eligibilityCheck(await loadState(tripId, { ownHoldId: holdId }), selections, holdId);
  if (!post.ok) {
    await SeatInventory.updateMany({ tripId, holdId }, { $unset: holdUnset() });
    throw new HttpError(409, 'NOT_ELIGIBLE', 'Selected seats are no longer available for you', post.violations);
  }
  await audit('seat.hold', { actorId: userId, tripId, data: { holdId, seats: got, expiresAt } });
  return { holdId, expiresAt, seats: selections };
}

export const holdUnset = () => ({ holdId: '', holdUserId: '', holdExpiresAt: '', holdGender: '', holdFamilyGroupId: '' });

export async function releaseHold(holdId: string, userId?: string) {
  const filter: Record<string, unknown> = { holdId };
  if (userId) filter.holdUserId = userId;
  const rows = await SeatInventory.find(filter).select('tripId seatId').lean();
  if (!rows.length) return 0;
  await SeatInventory.updateMany(filter, { $unset: holdUnset() });
  await audit('seat.release', { actorId: userId, tripId: rows[0].tripId, data: { holdId, seats: rows.map((r) => r.seatId) } });
  return rows.length;
}

/** Cron: clear expired holds (seats fall back to available / cancellation_pending). */
export async function sweepExpiredHolds() {
  const now = new Date();
  const res = await SeatInventory.updateMany({ holdExpiresAt: { $lte: now } }, { $unset: holdUnset() });
  return res.modifiedCount;
}
