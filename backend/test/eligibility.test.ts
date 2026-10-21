import { describe, expect, it } from 'vitest';
import { buildLayout } from '../src/services/layout';
import { allowedGendersFor, pairPartner, validateSeatEligibility, type GenderPolicy, type Occupancy } from '../src/services/seatEligibility';
import { priceBreakdown, refundBreakdown, standardTermsRefund } from '../src/services/money';

const layout = buildLayout('seater', { rows: 3 });
const all = new Set(layout.decks[0].seats.map((s) => s.id));
const policy: GenderPolicy = { enforce: true, femaleAdjacentRestricted: true, allowSameBookingAdjacent: true };
const base = { layout, ladiesOnly: new Set<string>(), policy };

function check(seatId: string, gender: 'male' | 'female' | 'other', occ: Occupancy, groupId = 'g1', p = policy, open = all) {
  return validateSeatEligibility({ ...base, policy: p, occupancy: occ, openSeats: open, groupId, selections: [{ seatId, gender }] });
}

describe('pair detection', () => {
  it('pairs seats on the same side of the aisle only', () => {
    expect(pairPartner(layout, 'D1-1A')).toBe('D1-1B');
    expect(pairPartner(layout, 'D1-1B')).toBe('D1-1A');
    expect(pairPartner(layout, 'D1-1C')).toBe('D1-1D');
  });
  it('sleeper berths on different decks never pair', () => {
    const sl = buildLayout('sleeper', { rows: 2 });
    expect(pairPartner(sl, 'D1-L1A')).toBe('D1-L1B');
    expect(pairPartner(sl, 'D2-U1A')).toBe('D2-U1B');
  });
});

describe('gender rules', () => {
  const open = new Set(all);
  it('rule 1: seat beside a male is open only to males', () => {
    const occ: Occupancy = new Map([['D1-1A', { gender: 'male', groupId: 'x' }]]);
    open.delete('D1-1A');
    expect(check('D1-1B', 'male', occ, 'g1', policy, open).ok).toBe(true);
    expect(check('D1-1B', 'female', occ, 'g1', policy, open).violations[0].code).toBe('PAIR_MALE_ONLY');
    expect(check('D1-1B', 'other', occ, 'g1', policy, open).ok).toBe(false);
  });
  it('rule 2: seat beside a female is restricted to females per policy', () => {
    const o = new Set(all);
    o.delete('D1-1A');
    const occ: Occupancy = new Map([['D1-1A', { gender: 'female', groupId: 'x' }]]);
    expect(check('D1-1B', 'male', occ, 'g1', policy, o).violations[0].code).toBe('PAIR_FEMALE_ONLY');
    expect(check('D1-1B', 'female', occ, 'g1', policy, o).ok).toBe(true);
    const lax = { ...policy, femaleAdjacentRestricted: false };
    expect(check('D1-1B', 'male', occ, 'g1', lax, o).ok).toBe(true);
  });
  it('rule 3: same booking may sit together when policy allows', () => {
    const sel = [
      { seatId: 'D1-1A', gender: 'male' as const },
      { seatId: 'D1-1B', gender: 'female' as const },
    ];
    expect(validateSeatEligibility({ ...base, occupancy: new Map(), openSeats: all, groupId: 'g1', selections: sel }).ok).toBe(true);
    const strict = { ...policy, allowSameBookingAdjacent: false };
    const r = validateSeatEligibility({ ...base, policy: strict, occupancy: new Map(), openSeats: all, groupId: 'g1', selections: sel });
    expect(r.ok).toBe(false);
    expect(r.violations[0].code).toBe('MIXED_PAIR_NOT_ALLOWED');
  });
  it('same booking id recognised against an already held partner seat', () => {
    const o = new Set(all);
    o.delete('D1-1A');
    const occ: Occupancy = new Map([['D1-1A', { gender: 'male', groupId: 'g1' }]]);
    expect(check('D1-1B', 'female', occ, 'g1', policy, o).ok).toBe(true);
    expect(check('D1-1B', 'female', occ, 'other-group', policy, o).ok).toBe(false);
  });
  it('family-linked passengers from different bookings count as one party', () => {
    const o = new Set(all);
    o.delete('D1-1A');
    const occ: Occupancy = new Map([['D1-1A', { gender: 'male', groupId: 'g0', familyGroupId: 'family:u1' }]]);
    const r = validateSeatEligibility({ ...base, occupancy: occ, openSeats: o, groupId: 'g2', selections: [{ seatId: 'D1-1B', gender: 'female', familyGroupId: 'family:u1' }] });
    expect(r.ok).toBe(true);
  });
  it('rule 4: all-or-nothing, one bad seat fails the whole selection', () => {
    const o = new Set(all);
    o.delete('D1-2A');
    const occ: Occupancy = new Map([['D1-2A', { gender: 'male', groupId: 'x' }]]);
    const r = validateSeatEligibility({
      ...base, occupancy: occ, openSeats: o, groupId: 'g1',
      selections: [{ seatId: 'D1-1A', gender: 'female' }, { seatId: 'D1-2B', gender: 'female' }],
    });
    expect(r.ok).toBe(false);
    expect(r.violations).toHaveLength(1);
  });
  it('ladies-only seats reject non-female', () => {
    const r = validateSeatEligibility({ ...base, ladiesOnly: new Set(['D1-1A']), occupancy: new Map(), openSeats: all, groupId: 'g', selections: [{ seatId: 'D1-1A', gender: 'male' }] });
    expect(r.violations[0].code).toBe('LADIES_ONLY');
  });
  it('taken and duplicate seats are rejected', () => {
    const o = new Set(all);
    o.delete('D1-1A');
    expect(check('D1-1A', 'male', new Map(), 'g', policy, o).violations[0].code).toBe('SEAT_TAKEN');
    const r = validateSeatEligibility({ ...base, occupancy: new Map(), openSeats: all, groupId: 'g', selections: [{ seatId: 'D1-1A', gender: 'male' }, { seatId: 'D1-1A', gender: 'male' }] });
    expect(r.violations.some((v) => v.code === 'DUPLICATE_SEAT')).toBe(true);
  });
  it('allowedGendersFor hides restricted seats', () => {
    const o = new Set(all);
    o.delete('D1-1A');
    const occ: Occupancy = new Map([['D1-1A', { gender: 'male', groupId: 'x' }]]);
    expect(allowedGendersFor({ ...base, occupancy: occ, openSeats: o }, 'D1-1B')).toEqual(['male']);
    expect(allowedGendersFor({ ...base, occupancy: new Map(), openSeats: all }, 'D1-1B')).toEqual(['male', 'female', 'other']);
  });
});

describe('money', () => {
  it('refund = ticket - fee (1000 - 50 = 950)', () => {
    expect(refundBreakdown(1000, 50)).toEqual({ ticketAmount: 1000, deduction: 50, refund: 950 });
  });
  it('refund never negative', () => {
    expect(refundBreakdown(30, 50).refund).toBe(0);
  });
  it('standard terms percent', () => {
    expect(standardTermsRefund(1000, 50).refund).toBe(500);
    expect(standardTermsRefund(1000, 150).refund).toBe(1000);
  });
  it('price breakdown adds 5% GST', () => {
    expect(priceBreakdown([500, 500])).toEqual({ base: 1000, gst: 50, total: 1050 });
  });
});
