import type { BusLayout, Gender } from '@busgo/shared';

export interface GenderPolicy {
  enforce: boolean;
  femaleAdjacentRestricted: boolean;
  allowSameBookingAdjacent: boolean;
}

export interface Occupant {
  gender: Gender;
  groupId?: string | null;
  familyGroupId?: string | null;
}

/** seatId -> occupant, for seats that are held / booked / cancellation_pending. */
export type Occupancy = Map<string, Occupant>;

export interface Selection {
  seatId: string;
  gender: Gender;
  familyGroupId?: string | null;
}

export type ViolationCode =
  | 'UNKNOWN_SEAT'
  | 'SEAT_TAKEN'
  | 'LADIES_ONLY'
  | 'PAIR_MALE_ONLY'
  | 'PAIR_FEMALE_ONLY'
  | 'MIXED_PAIR_NOT_ALLOWED'
  | 'DUPLICATE_SEAT';

export interface Violation {
  seatId: string;
  code: ViolationCode;
}

export interface EligibilityInput {
  layout: BusLayout;
  occupancy: Occupancy;
  /** seats open for new holds (available, or cancellation_pending awaiting a replacement). */
  openSeats: Set<string>;
  ladiesOnly: Set<string>;
  policy: GenderPolicy;
  selections: Selection[];
  /** bookingId / holdId shared by everyone in this request. */
  groupId: string;
}

/**
 * Adjacent pair partner: same deck, same row, neighbouring column, same side of the aisle.
 * Upper/lower berths sit on different decks so they never pair.
 */
export function pairPartner(layout: BusLayout, seatId: string): string | null {
  for (const deck of layout.decks) {
    const seat = deck.seats.find((s) => s.id === seatId);
    if (!seat) continue;
    const side = seat.position.col < deck.aislePosition ? 0 : 1;
    const partner = deck.seats.find(
      (s) =>
        s.id !== seat.id &&
        s.position.row === seat.position.row &&
        Math.abs(s.position.col - seat.position.col) === 1 &&
        (s.position.col < deck.aislePosition ? 0 : 1) === side,
    );
    return partner ? partner.id : null;
  }
  return null;
}

export function validateSeatEligibility(input: EligibilityInput): { ok: boolean; violations: Violation[] } {
  const { layout, occupancy, openSeats, ladiesOnly, policy, selections, groupId } = input;
  const violations: Violation[] = [];
  const known = new Set(layout.decks.flatMap((d) => d.seats.map((s) => s.id)));
  const picked = new Map<string, Selection>();
  for (const s of selections) {
    if (picked.has(s.seatId)) violations.push({ seatId: s.seatId, code: 'DUPLICATE_SEAT' });
    picked.set(s.seatId, s);
  }

  for (const sel of selections) {
    if (!known.has(sel.seatId)) {
      violations.push({ seatId: sel.seatId, code: 'UNKNOWN_SEAT' });
      continue;
    }
    if (!openSeats.has(sel.seatId)) {
      violations.push({ seatId: sel.seatId, code: 'SEAT_TAKEN' });
      continue;
    }
    if (ladiesOnly.has(sel.seatId) && sel.gender !== 'female') {
      violations.push({ seatId: sel.seatId, code: 'LADIES_ONLY' });
      continue;
    }
    if (!policy.enforce) continue;

    const partnerId = pairPartner(layout, sel.seatId);
    if (!partnerId) continue;

    let neighbour: (Occupant & { same: boolean }) | null = null;
    const inRequest = picked.get(partnerId);
    if (inRequest) {
      neighbour = { gender: inRequest.gender, same: true };
    } else {
      const occ = occupancy.get(partnerId);
      if (occ) {
        const same =
          (!!occ.groupId && occ.groupId === groupId) ||
          (!!occ.familyGroupId && !!sel.familyGroupId && occ.familyGroupId === sel.familyGroupId);
        neighbour = { ...occ, same };
      }
    }
    if (!neighbour) continue;

    if (neighbour.same) {
      if (neighbour.gender !== sel.gender && !policy.allowSameBookingAdjacent) {
        violations.push({ seatId: sel.seatId, code: 'MIXED_PAIR_NOT_ALLOWED' });
      }
      continue;
    }
    // A stranger sits next door.
    if (neighbour.gender === 'male' && sel.gender !== 'male') {
      violations.push({ seatId: sel.seatId, code: 'PAIR_MALE_ONLY' });
    } else if (neighbour.gender === 'female' && policy.femaleAdjacentRestricted && sel.gender !== 'female') {
      violations.push({ seatId: sel.seatId, code: 'PAIR_FEMALE_ONLY' });
    }
  }
  return { ok: violations.length === 0, violations };
}

/** Genders that may take a single open seat right now (used to hide restricted seats in the UI). */
export function allowedGendersFor(
  input: Omit<EligibilityInput, 'selections' | 'groupId'>,
  seatId: string,
): Gender[] {
  if (!input.openSeats.has(seatId)) return [];
  return (['male', 'female', 'other'] as Gender[]).filter(
    (gender) =>
      validateSeatEligibility({ ...input, groupId: '__probe__', selections: [{ seatId, gender }] }).ok,
  );
}
