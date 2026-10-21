import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.OSRM_URL = ''; // real routing is exercised explicitly (mocked) in its own tests
process.env.GROQ_API_KEY_1 = '';
process.env.GROQ_API_KEY_2 = '';
let rs: MongoMemoryReplSet;
let app: any;
let M: typeof import('../src/models');
let svc: { cancel: typeof import('../src/services/cancellationService'); email: typeof import('../src/services/email'); pay: typeof import('../src/services/paymentService'); sign: typeof import('../src/services/refundService'); dist: typeof import('../src/services/distance'); env: typeof import('../src/config/env') };

let tripId: string;
let boardId: string;
let dropId: string;
const tokens: Record<string, string> = {};

async function signup(key: string, gender: 'male' | 'female' | 'other', n: number) {
  const r = await request(app).post('/api/auth/signup').send({ name: `User ${key}`, email: `${key}@t.test`, phone: `98000000${String(n).padStart(2, '0')}`, gender, password: 'Password@1' });
  expect(r.status).toBe(201);
  tokens[key] = r.body.accessToken;
}
const auth = (k: string) => ({ Authorization: `Bearer ${tokens[k]}` });
const hold = (k: string, seats: any[], replaceHoldId?: string) => request(app).post(`/api/trips/${tripId}/hold`).set(auth(k)).send({ seats, replaceHoldId });

async function bookAndPay(k: string, seats: { seatId: string; gender: any; name: string }[], holdId: string) {
  const b = await request(app).post('/api/bookings').set(auth(k)).send({
    tripId, holdId, boardingPointId: boardId, droppingPointId: dropId,
    passengers: seats.map((s) => ({ seatId: s.seatId, name: s.name, age: 30, gender: s.gender })),
    contact: { name: `User ${k}`, email: `${k}@t.test`, phone: '9800000001' },
  });
  expect(b.status).toBe(201);
  const init = await request(app).post('/api/payments/initiate').set(auth(k)).set('Idempotency-Key', `key-${k}-${holdId}`).send({ bookingId: b.body.id });
  expect(init.status).toBe(201);
  return { booking: b.body, payment: init.body };
}
function webhook(body: object, sig?: string) {
  const raw = JSON.stringify(body);
  return request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').set('x-signature', sig ?? svc.sign.signPayload(raw)).send(raw);
}
const success = (p: any, eventId = `ev-${p.reference}`) => webhook({ eventId, reference: p.reference, status: 'success', amount: p.amount, gatewayTxnId: `TX-${p.reference}` });

beforeAll(async () => {
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = rs.getUri('busgo_test');
  await mongoose.connect(process.env.MONGODB_URI);
  M = await import('../src/models');
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  svc = {
    cancel: await import('../src/services/cancellationService'),
    email: await import('../src/services/email'),
    pay: await import('../src/services/paymentService'),
    sign: await import('../src/services/refundService'),
    dist: await import('../src/services/distance'),
    env: await import('../src/config/env'),
  };
  const { createApp } = await import('../src/app');
  app = createApp();
  const { buildLayout } = await import('../src/services/layout');
  const { ensureInventory } = await import('../src/services/seatService');

  const chennai = await M.City.create({ name: 'Chennai', slug: 'chennai', state: 'TN', lat: 13.08, lng: 80.27, points: [{ name: 'Koyambedu', lat: 13.07, lng: 80.19 }] });
  const trichy = await M.City.create({ name: 'Trichy', slug: 'trichy', state: 'TN', lat: 10.79, lng: 78.7, points: [{ name: 'Chatram', lat: 10.82, lng: 78.69 }] });
  const op = await M.Operator.create({ name: 'Test Op', policy: { cancellationFee: 50, cutoffHoursBeforeDeparture: 2, fallbackPolicy: 'standard_terms', standardRefundPercent: 50 } });
  const layout = buildLayout('seater', { rows: 4 });
  const bus = await M.Bus.create({ operatorId: op._id, name: 'B1', registration: 'TN01', busType: 'seater', layout });
  const route = await M.Route.create({ fromCityId: chennai._id, toCityId: trichy._id });
  const stop = (p: any, t: Date | null) => ({ pointId: String(p._id), name: p.name, landmark: '', lat: p.lat, lng: p.lng, time: t });
  const dep = new Date(Date.now() + 10 * 3600_000);
  const trip = await M.Trip.create({ operatorId: op._id, busId: bus._id, routeId: route._id, fromCityId: chennai._id, toCityId: trichy._id, departureTime: dep, fares: { seater: 450, sleeper: 0 }, boarding: chennai.points.map((p) => stop(p, dep)), dropping: trichy.points.map((p) => stop(p, null)) });
  await ensureInventory(trip._id, layout);
  await M.SeatInventory.updateOne({ tripId: trip._id, seatId: 'D1-1A' }, { $set: { ladiesOnly: true } });
  tripId = String(trip._id);
  boardId = String(chennai.points[0]._id);
  dropId = String(trichy.points[0]._id);

  await signup('m1', 'male', 1);
  await signup('f1', 'female', 2);
  await signup('f2', 'female', 3);
  await signup('m2', 'male', 4);
  await signup('f3', 'female', 5);
}, 900000);

afterAll(async () => {
  await mongoose.disconnect();
  await rs.stop();
});

describe('auth', () => {
  it('forgot password: single-use link, old password stops working, sessions revoked, no account enumeration', async () => {
    const su = await request(app).post('/api/auth/signup').send({ name: 'Forgetful', email: 'forget@t.test', phone: '9844444444', gender: 'male', age: 50, password: 'OldPassword@1' });
    expect(su.status).toBe(201);
    const unknown = await request(app).post('/api/auth/forgot').send({ email: 'nobody@t.test' });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual({ sent: true }); // same answer, no link, nothing revealed
    const f = await request(app).post('/api/auth/forgot').send({ email: 'FORGET@t.test' });
    expect(f.body.sent).toBe(true);
    const token = f.body.devLink.split('/').pop();
    expect(await M.EmailJob.countDocuments({ to: 'forget@t.test', template: 'password_reset' })).toBe(1);

    expect((await request(app).post('/api/auth/reset').send({ token: 'x'.repeat(64), password: 'NewPassword@1' })).status).toBe(400);
    expect((await request(app).post('/api/auth/reset').send({ token, password: 'short' })).status).toBe(400);
    expect((await request(app).post('/api/auth/reset').send({ token, password: 'NewPassword@1' })).body).toEqual({ ok: true });
    expect((await request(app).post('/api/auth/reset').send({ token, password: 'Another@12345' })).status).toBe(400); // single use
    expect((await request(app).post('/api/auth/login').send({ email: 'forget@t.test', password: 'OldPassword@1' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: 'forget@t.test', password: 'NewPassword@1' })).status).toBe(200);
    expect(await M.AuditLog.countDocuments({ event: 'auth.password_reset' })).toBe(1);
  });

  it('stores age from signup, returns it, seeds the Self passenger only when age is known', async () => {
    const ok = await request(app).post('/api/auth/signup').send({ name: 'Aged User', email: 'aged@t.test', phone: '9822222222', gender: 'male', age: 41, password: 'Password@1' });
    expect(ok.status).toBe(201);
    expect(ok.body.user.age).toBe(41);
    const me = await request(app).get('/api/passengers').set('Authorization', `Bearer ${ok.body.accessToken}`);
    expect(me.body).toHaveLength(1);
    expect(me.body[0]).toMatchObject({ name: 'Aged User', age: 41, relation: 'Self' });
    const none = await request(app).post('/api/auth/signup').send({ name: 'No Age', email: 'noage@t.test', phone: '9833333333', gender: 'female', password: 'Password@1' });
    expect(none.body.user.age).toBeNull();
    expect((await request(app).get('/api/passengers').set('Authorization', `Bearer ${none.body.accessToken}`)).body).toHaveLength(0);
    const set = await request(app).patch('/api/auth/me').set('Authorization', `Bearer ${none.body.accessToken}`).send({ age: 33 });
    expect(set.body.user.age).toBe(33);
    expect((await request(app).patch('/api/auth/me').set('Authorization', `Bearer ${none.body.accessToken}`).send({ age: 0 })).status).toBe(400);
  });

  it('rejects signup without gender', async () => {
    const r = await request(app).post('/api/auth/signup').send({ name: 'No Gender', email: 'ng@t.test', phone: '9811111111', password: 'Password@1' });
    expect(r.status).toBe(400);
  });
  it('rejects bad phone number', async () => {
    const r = await request(app).post('/api/auth/signup').send({ name: 'Bad Phone', email: 'bp@t.test', phone: '123', gender: 'male', password: 'Password@1' });
    expect(r.status).toBe(400);
  });
  it('gender is locked after signup (seat eligibility depends on it)', async () => {
    const bad = await request(app).patch('/api/auth/me').set(auth('m1')).send({ gender: 'female' });
    expect(bad.status).toBe(403);
    expect(bad.body.error).toBe('GENDER_LOCKED');
    const same = await request(app).patch('/api/auth/me').set(auth('m1')).send({ gender: 'male', name: 'User m1 renamed' });
    expect(same.status).toBe(200);
    expect(same.body.user).toMatchObject({ gender: 'male', name: 'User m1 renamed' });
    expect((await request(app).get('/api/auth/me').set(auth('m1'))).body.user.gender).toBe('male');
  });
  it('guests can view seats but cannot hold', async () => {
    expect((await request(app).get(`/api/trips/${tripId}/seats`)).status).toBe(200);
    expect((await request(app).post(`/api/trips/${tripId}/hold`).send({ seats: [{ seatId: 'D1-2A', gender: 'male' }] })).status).toBe(401);
  });
});

describe('seat holds & gender rules (HTTP)', () => {
  it('male holds 2A -> female cannot take 2B, male can', async () => {
    const h = await hold('m1', [{ seatId: 'D1-2A', gender: 'male' }]);
    expect(h.status).toBe(201);
    const bad = await hold('f1', [{ seatId: 'D1-2B', gender: 'female' }]);
    expect(bad.status).toBe(409);
    expect(bad.body.details[0].code).toBe('PAIR_MALE_ONLY');
    const map = await request(app).get(`/api/trips/${tripId}/seats`);
    expect(map.body.seats['D1-2B'].allowedGenders).toEqual(['male']);
    expect(map.body.seats['D1-2A'].state).toBe('held');
    const ok = await hold('m2', [{ seatId: 'D1-2B', gender: 'male' }]);
    expect(ok.status).toBe(201);
  });
  it('same-seat race: exactly one of two simultaneous holds wins', async () => {
    const [a, b] = await Promise.all([hold('f1', [{ seatId: 'D1-3C', gender: 'female' }]), hold('f2', [{ seatId: 'D1-3C', gender: 'female' }])]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });
  it('ladies-only seat rejects a male', async () => {
    const r = await hold('m1', [{ seatId: 'D1-1A', gender: 'male' }]);
    expect(r.status).toBe(409);
    expect(r.body.details[0].code).toBe('LADIES_ONLY');
  });
});

describe('changing a held seat\'s gender (replaceHoldId)', () => {
  it('a refused change keeps the original hold; an allowed change swaps it', async () => {
    // own trip so earlier tests cannot interfere
    const base: any = await M.Trip.findById(tripId).lean();
    const bus: any = await M.Bus.findById(base.busId).lean();
    const t2 = await M.Trip.create({ ...base, _id: new mongoose.Types.ObjectId(), departureTime: new Date(Date.now() + 20 * 3600_000), source: 'operator' });
    const { ensureInventory } = await import('../src/services/seatService');
    await ensureInventory(t2._id, bus.layout);
    const id2 = String(t2._id);
    const h = (k: string, seats: any[], replaceHoldId?: string) => request(app).post(`/api/trips/${id2}/hold`).set(auth(k)).send({ seats, replaceHoldId });

    // f2 (female) sits on 2C; its pair seat 2D therefore belongs to females
    expect((await h('f2', [{ seatId: 'D1-2C', gender: 'female' }])).status).toBe(201);
    // f3 holds 2D as female, then tries to become male: refused, original hold must survive
    const mine = await h('f3', [{ seatId: 'D1-2D', gender: 'female' }]);
    expect(mine.status).toBe(201);
    const bad = await h('f3', [{ seatId: 'D1-2D', gender: 'male' }], mine.body.holdId);
    expect(bad.status).toBe(409);
    expect(bad.body.error).toBe('NOT_ELIGIBLE');
    const kept = await M.SeatInventory.findOne({ tripId: id2, seatId: 'D1-2D' }).lean();
    expect(kept!.holdId).toBe(mine.body.holdId);
    expect(kept!.holdGender).toBe('female');

    // an unconstrained pair: m1 on 3A, nobody beside -> male <-> other is fine and returns a new hold
    const one = await h('m1', [{ seatId: 'D1-3A', gender: 'male' }]);
    expect(one.status).toBe(201);
    const swap = await h('m1', [{ seatId: 'D1-3A', gender: 'other' }], one.body.holdId);
    expect(swap.status).toBe(201);
    expect(swap.body.holdId).not.toBe(one.body.holdId);
    expect((await M.SeatInventory.findOne({ tripId: id2, seatId: 'D1-3A' }).lean())!.holdGender).toBe('other');
  });
});

describe('booking -> payment -> confirmation (idempotent)', () => {
  it('confirms once even if the webhook is delivered 3 times, queues one email', async () => {
    const h = await hold('f2', [{ seatId: 'D1-4C', gender: 'female' }, { seatId: 'D1-4D', gender: 'male' }]);
    expect(h.status).toBe(201); // same booking => mixed adjacent pair allowed
    const { booking, payment } = await bookAndPay('f2', [{ seatId: 'D1-4C', gender: 'female', name: 'Wife' }, { seatId: 'D1-4D', gender: 'male', name: 'Husband' }], h.body.holdId);
    expect(booking.price.total).toBe(Math.round(900 * 1.05));
    // same Idempotency-Key => same payment
    const again = await request(app).post('/api/payments/initiate').set(auth('f2')).set('Idempotency-Key', `key-f2-${h.body.holdId}`).send({ bookingId: booking.id });
    expect(again.body.reference).toBe(payment.reference);
    expect(payment.redirectUrl).toContain('/mock-gateway');

    expect((await webhook({ eventId: 'x1', reference: payment.reference, status: 'success', amount: payment.amount }, 'bad-signature')).status).toBe(401);
    const r1 = await success(payment);
    const r2 = await success(payment); // exact replay
    const r3 = await success(payment, 'another-event-id'); // different event, same payment
    expect(r1.body.duplicate).toBe(false);
    expect(r2.body.duplicate).toBe(true);
    expect(r3.body.duplicate).toBe(true);

    const b = await M.Booking.findById(booking.id).lean();
    expect(b!.status).toBe('booked');
    expect(await M.BookingPassenger.countDocuments({ bookingId: booking.id, active: true })).toBe(2);
    expect(await M.SeatInventory.countDocuments({ tripId, status: 'booked', bookingId: booking.id })).toBe(2);
    expect(await M.EmailJob.countDocuments({ template: 'booking_confirmation', bookingId: booking.id })).toBe(1);
    expect(await M.AuditLog.countDocuments({ event: 'booking.confirmed', bookingId: booking.id })).toBe(1);

    // email renders with PDF + QR + policy and sends through the (JSON) transport
    await svc.email.processEmailQueue();
    const job = await M.EmailJob.findOne({ bookingId: booking.id, template: 'booking_confirmation' }).lean();
    expect(['logged', 'sent']).toContain(job!.status);
  });

  it('the payment QR link uses the origin the buyer is on (any domain / network)', async () => {
    const base: any = await M.Trip.findById(tripId).lean();
    const bus: any = await M.Bus.findById(base.busId).lean();
    const t3 = await M.Trip.create({ ...base, _id: new mongoose.Types.ObjectId(), departureTime: new Date(Date.now() + 30 * 3600_000) });
    const { ensureInventory } = await import('../src/services/seatService');
    await ensureInventory(t3._id, bus.layout);
    const hold3 = await request(app).post(`/api/trips/${t3._id}/hold`).set(auth('m1')).send({ seats: [{ seatId: 'D1-2A', gender: 'male' }] });
    expect(hold3.status).toBe(201);
    const bk = await request(app).post('/api/bookings').set(auth('m1')).send({ tripId: String(t3._id), holdId: hold3.body.holdId, boardingPointId: boardId, droppingPointId: dropId, passengers: [{ seatId: 'D1-2A', name: 'Origin Pax', age: 30, gender: 'male' }], contact: { name: 'm1', email: 'm1@t.test', phone: '9800000001' } });
    expect(bk.status).toBe(201);
    const init = await request(app).post('/api/payments/initiate').set(auth('m1')).set('Origin', 'https://tickets.busgo.example').set('Idempotency-Key', `origin-${hold3.body.holdId}`).send({ bookingId: bk.body.id });
    expect(init.status).toBe(201);
    expect(init.body.approveUrl.startsWith('https://tickets.busgo.example/pay/approve/')).toBe(true);
  });

  it('amount mismatch is rejected', async () => {
    const h = await hold('f3', [{ seatId: 'D1-2C', gender: 'female' }]);
    const { payment } = await bookAndPay('f3', [{ seatId: 'D1-2C', gender: 'female', name: 'F3' }], h.body.holdId);
    const r = await webhook({ eventId: 'amt-1', reference: payment.reference, status: 'success', amount: 1 });
    expect(r.status).toBe(400);
  });

  it('payment failure leaves seats held and emails the user', async () => {
    const h = await hold('m1', [{ seatId: 'D1-3A', gender: 'male' }]);
    const { payment, booking } = await bookAndPay('m1', [{ seatId: 'D1-3A', gender: 'male', name: 'M1' }], h.body.holdId);
    const r = await webhook({ eventId: 'fail-1', reference: payment.reference, status: 'failed', reason: 'Declined' });
    expect(r.status).toBe(200);
    expect((await M.Booking.findById(booking.id).lean())!.status).toBe('pending_payment');
    expect(await M.EmailJob.countDocuments({ template: 'payment_failed', bookingId: booking.id })).toBe(1);
  });

  it('audit log is append-only', async () => {
    await expect(M.AuditLog.updateOne({}, { $set: { event: 'x' } })).rejects.toThrow(/append-only/);
    await expect(M.AuditLog.deleteMany({})).rejects.toThrow(/append-only/);
  });
});

describe('cancellation pending -> replacement -> refund', () => {
  let original: any;
  it('shows refund breakdown, goes pending, seat stays unreleased but rebookable', async () => {
    const h = await hold('f1', [{ seatId: 'D1-1C', gender: 'female' }]);
    const { booking, payment } = await bookAndPay('f1', [{ seatId: 'D1-1C', gender: 'female', name: 'Original' }], h.body.holdId);
    await success(payment);
    original = booking;

    const prev = await request(app).get(`/api/bookings/${booking.id}/cancel-preview`).set(auth('f1'));
    expect(prev.body).toMatchObject({ ticketAmount: 473, fee: 50, refundAmount: 423, cancellable: true });

    const c = await request(app).post(`/api/bookings/${booking.id}/cancel`).set(auth('f1'));
    expect(c.status).toBe(202);
    expect(c.body.status).toBe('cancellation_pending');
    const again = await request(app).post(`/api/bookings/${booking.id}/cancel`).set(auth('f1'));
    expect(again.status).toBe(202);
    expect(await M.CancellationRequest.countDocuments({ bookingId: booking.id })).toBe(1);
    expect(await M.EmailJob.countDocuments({ template: 'cancellation_pending', bookingId: booking.id })).toBe(1);

    const seat = await M.SeatInventory.findOne({ tripId, seatId: 'D1-1C' }).lean();
    expect(seat!.status).toBe('cancellation_pending');
    const map = await request(app).get(`/api/trips/${tripId}/seats`);
    expect(map.body.seats['D1-1C'].state).toBe('waiting'); // red in the UI, still bookable by a replacement
    // the cancelling woman still counts as a neighbour: 1D is female-only
    expect(map.body.seats['D1-1D'].allowedGenders).toEqual(['female']);
  });

  it('a replacement booking cancels the original and starts the refund, then webhook completes it', async () => {
    const h = await hold('f3', [{ seatId: 'D1-1C', gender: 'female' }]);
    expect(h.status).toBe(201);
    const { booking, payment } = await bookAndPay('f3', [{ seatId: 'D1-1C', gender: 'female', name: 'Replacement' }], h.body.holdId);
    // 'f3' already holds pending booking on 2C from earlier test; fine.
    const wr = await success(payment);
    expect(wr.status).toBe(200);
    expect((await M.Booking.findById(booking.id).lean())!.status).toBe('booked');

    const o = await M.Booking.findById(original.id).lean();
    expect(o!.status).toBe('refund_processing');
    const refund = await M.Refund.findOne({ bookingId: original.id }).lean();
    expect(refund).toMatchObject({ ticketAmount: 473, deduction: 50, amount: 423, status: 'processing' });
    expect((await M.CancellationRequest.findOne({ bookingId: original.id }).lean())!.status).toBe('replaced');
    expect(await M.EmailJob.countDocuments({ template: 'cancellation_completed', bookingId: original.id })).toBe(1);

    const rw = await webhook({ eventId: 'rf-1', type: 'refund', reference: refund!.reference, status: 'success', gatewayTxnId: 'RFX1' });
    expect(rw.body.duplicate).toBe(false);
    const rw2 = await webhook({ eventId: 'rf-1', type: 'refund', reference: refund!.reference, status: 'success' });
    expect(rw2.body.duplicate).toBe(true);
    expect((await M.Booking.findById(original.id).lean())!.status).toBe('refund_completed');
    expect(await M.EmailJob.countDocuments({ template: 'refund_completed', bookingId: original.id })).toBe(1);
  });
});

describe('cron fallback after cutoff', () => {
  async function pendingCancel(k: string, seatId: string, gender: any, opPolicy: object) {
    await M.Operator.updateMany({}, { $set: { policy: { cancellationFee: 50, cutoffHoursBeforeDeparture: 2, holdMinutes: 8, ...opPolicy, gender: { enforce: true, femaleAdjacentRestricted: true, allowSameBookingAdjacent: true } } } });
    const h = await hold(k, [{ seatId, gender }]);
    expect(h.status).toBe(201);
    const { booking, payment } = await bookAndPay(k, [{ seatId, gender, name: 'Pax' }], h.body.holdId);
    await success(payment);
    await request(app).post(`/api/bookings/${booking.id}/cancel`).set(auth(k));
    await M.CancellationRequest.updateOne({ bookingId: booking.id }, { $set: { cutoffAt: new Date(Date.now() - 1000) } });
    return booking;
  }

  it('standard_terms: refunds the configured percentage and frees the seat', async () => {
    const b = await pendingCancel('m1', 'D1-4A', 'male', { fallbackPolicy: 'standard_terms', standardRefundPercent: 50 });
    expect(await svc.cancel.applyCancellationFallbacks()).toBeGreaterThanOrEqual(1);
    const after = await M.Booking.findById(b.id).lean();
    expect(after!.status).toBe('refund_processing');
    expect((await M.Refund.findOne({ bookingId: b.id }).lean())!.amount).toBe(Math.round(473 * 0.5));
    expect((await M.SeatInventory.findOne({ tripId, seatId: 'D1-4A' }).lean())!.status).toBe('available');
    expect(await M.EmailJob.countDocuments({ template: 'cancellation_final', bookingId: b.id })).toBe(1);
    expect(await svc.cancel.applyCancellationFallbacks()).toBe(0); // idempotent
  });

  it('reject: booking stays confirmed, no refund', async () => {
    const b = await pendingCancel('m2', 'D1-4B', 'male', { fallbackPolicy: 'reject' });
    await svc.cancel.applyCancellationFallbacks();
    expect((await M.Booking.findById(b.id).lean())!.status).toBe('booked');
    expect(await M.Refund.countDocuments({ bookingId: b.id })).toBe(0);
    expect((await M.SeatInventory.findOne({ tripId, seatId: 'D1-4B' }).lean())!.status).toBe('booked');
  });
});

describe('distance service', () => {
  it('returns "unavailable" instead of fake data when the API fails, caches real data', async () => {
    const [a, b] = await Promise.all([M.City.findOne({ slug: 'chennai' }), M.City.findOne({ slug: 'trichy' })]);
    svc.env.env.GOOGLE_MAPS_SERVER_KEY = 'test-key';
    const spy = vi.spyOn(globalThis, 'fetch');
    spy.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    expect((await svc.dist.getRouteInfo(String(a!._id), String(b!._id))).available).toBe(false);

    spy.mockResolvedValueOnce(new Response(JSON.stringify({ routes: [{ duration: '19800s', distanceMeters: 332400, polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' } }] }), { status: 200 }));
    const ok = await svc.dist.getRouteInfo(String(a!._id), String(b!._id));
    expect(ok).toMatchObject({ available: true, distanceKm: 332.4, durationMin: 330 });
    const cached = await svc.dist.getRouteInfo(String(a!._id), String(b!._id));
    expect(cached.cached).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2); // second success came from the Mongo cache
    const api = await request(app).get('/api/routes/distance?from=chennai&to=trichy&departure=2030-01-01T06:00:00.000Z');
    expect(api.body.arrivalTime).toBe('2030-01-01T11:30:00.000Z'); // departure + API duration
    spy.mockRestore();
    svc.env.env.GOOGLE_MAPS_SERVER_KEY = '';
  });
});

describe('AI distance fallback (no Google key)', () => {
  const groq = (body: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }), { status: 200 });
  it('accepts a plausible Groq estimate, labels it ai, caches it', async () => {
    const [a, b] = await Promise.all([M.City.findOne({ slug: 'chennai' }), M.City.findOne({ slug: 'trichy' })]);
    await M.RouteDistanceCache.deleteMany({}); svc.dist.resetCaches();
    svc.env.env.GOOGLE_MAPS_SERVER_KEY = '';
    svc.env.env.GROQ_API_KEY_1 = 'k1';
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(groq({ distanceKm: 332, durationMin: 340, legsKm: [150, 182] }));
    const r = await svc.dist.getRouteInfo(String(a!._id), String(b!._id));
    expect(r).toMatchObject({ available: true, distanceKm: 332, durationMin: 340, source: 'ai' });
    const again = await svc.dist.getRouteInfo(String(a!._id), String(b!._id));
    expect(again).toMatchObject({ cached: true, source: 'ai' });
    expect(spy).toHaveBeenCalledTimes(1);
    const api = await request(app).get('/api/trips/search?from=chennai&to=trichy&date=' + new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10));
    expect(api.body.route).toMatchObject({ distanceKm: 332, source: 'ai' });
    spy.mockRestore();
    svc.env.env.GROQ_API_KEY_1 = '';
  });
  it('rejects an implausible estimate instead of showing it', async () => {
    const [a, b] = await Promise.all([M.City.findOne({ slug: 'chennai' }), M.City.findOne({ slug: 'trichy' })]);
    await M.RouteDistanceCache.deleteMany({}); svc.dist.resetCaches();
    svc.env.env.GROQ_API_KEY_1 = 'k1';
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(groq({ distanceKm: 50, durationMin: 60 }));
    expect((await svc.dist.getRouteInfo(String(a!._id), String(b!._id))).available).toBe(false);
    spy.mockRestore();
    svc.env.env.GROQ_API_KEY_1 = '';
  });
  it('validateAiEstimate sanity rules', async () => {
    const { validateAiEstimate } = svc.dist;
    const A = { lat: 13.08, lng: 80.27 };
    const B = { lat: 10.79, lng: 78.7 };
    expect(validateAiEstimate(A, B, { distanceKm: 330, durationMin: 330 })).toEqual({ distanceKm: 330, durationMin: 330 });
    expect(validateAiEstimate(A, B, { distanceKm: 100, durationMin: 120 })).toBeNull(); // shorter than straight line
    expect(validateAiEstimate(A, B, { distanceKm: 330, durationMin: 30 })).toBeNull(); // impossible speed
    expect(validateAiEstimate(A, B, { distanceKm: 'x', durationMin: 330 })).toBeNull();
  });
});

describe('places: typed source/destination + on-demand timetable', () => {
  const groq = (body: object) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }), { status: 200 });
  let cs: typeof import('../src/services/cityService');

  it('built-in towns, aliases and prefix suggestions', async () => {
    cs = await import('../src/services/cityService');
    expect(await cs.ensureCities()).toBeGreaterThan(50);
    expect(await cs.ensureCities()).toBe(0); // idempotent
    expect((await cs.suggestCities('ban'))[0].name).toBe('Bengaluru');
    expect((await cs.suggestCities('bangalore'))[0].name).toBe('Bengaluru'); // alias
    expect((await cs.resolvePlace('Mysore')).name).toBe('Mysuru');
    expect((await cs.resolvePlace('Tiruchirappalli')).slug).toBe('trichy'); // alias added to the existing city
    expect((await cs.resolvePlace('Salem, Tamil Nadu')).name).toBe('Salem');
    const api = await request(app).get('/api/places/suggest?q=coi');
    expect(api.body[0]).toMatchObject({ name: 'Coimbatore' });
  });

  it('unknown town is geocoded by Groq, saved, flagged approximate; bad answers rejected', async () => {
    svc.env.env.GROQ_API_KEY_1 = 'k1';
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(groq({ found: true, name: 'sholinganallur', state: 'Tamil Nadu', lat: 12.9, lng: 80.2279 }));
    const c = await cs.resolvePlace('Sholinganallur');
    expect(c).toMatchObject({ name: 'Sholinganallur', source: 'ai' });
    expect((await cs.resolvePlace('sholinganallur')).id).toBe(c.id); // second time: local, no Groq call
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockResolvedValueOnce(groq({ found: true, name: 'Paris', state: 'France', lat: 48.85, lng: 2.35 }));
    await expect(cs.resolvePlace('Parisx')).rejects.toMatchObject({ code: 'PLACE_NOT_FOUND' }); // outside service area
    spy.mockResolvedValueOnce(groq({ found: false }));
    await expect(cs.resolvePlace('Zzzzqq')).rejects.toMatchObject({ code: 'PLACE_NOT_FOUND' });
    await expect(cs.resolvePlace('<script>')).rejects.toMatchObject({ code: 'BAD_PLACE' });
    spy.mockRestore();
    svc.env.env.GROQ_API_KEY_1 = '';
  });

  it('a route with no published trips still returns a full timetable, created once', async () => {
    const date = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    const r1 = await request(app).get(`/api/trips/search?from=chennai&to=mysuru&date=${date}`);
    expect(r1.status).toBe(200);
    expect(r1.body.trips.length).toBe(6);
    expect(r1.body.trips[0].seatsLeft).toBeGreaterThan(0);
    expect(r1.body.trips.every((t: any) => t.demo === true)).toBe(true); // auto-generated sample timetable is labelled demo
    expect(r1.body.demo).toBe(true);
    const real = await request(app).get(`/api/trips/${tripId}`);
    expect(real.body.demo).toBe(false); // operator-published trip is not demo
    expect(r1.body.trips[0].fares.seater).toBeGreaterThanOrEqual(120);
    const n = await M.Trip.countDocuments();
    const r2 = await request(app).get(`/api/trips/search?from=chennai&to=mysuru&date=${date}`);
    expect(r2.body.trips.length).toBe(6);
    expect(await M.Trip.countDocuments()).toBe(n); // idempotent
    const [a, b] = await Promise.all([request(app).get(`/api/trips/search?from=chennai&to=kochi&date=${date}`), request(app).get(`/api/trips/search?from=chennai&to=kochi&date=${date}`)]);
    expect(a.body.trips.length).toBe(6);
    expect(b.body.trips.length).toBe(6); // concurrent searches don't double-create
    const f = await import('../src/services/tripGenerator');
    expect(f.fareFor('seater', 500).seater).toBe(550);
    expect(f.fareFor('sleeper', 500).sleeper).toBe(1000);
    expect(f.fareFor('seater', 20).seater).toBe(120); // minimum fare
  });
});

describe('OSRM road routing source', () => {
  const osrm = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
  it('uses real road geometry + distance, scales car time to bus time, caches', async () => {
    const [a, b] = await Promise.all([M.City.findOne({ slug: 'chennai' }), M.City.findOne({ slug: 'trichy' })]);
    await M.RouteDistanceCache.deleteMany({}); svc.dist.resetCaches();
    svc.env.env.OSRM_URL = 'https://osrm.test';
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(osrm({ code: 'Ok', routes: [{ distance: 327300, duration: 14820, geometry: '_p~iF~ps|U_ulLnnqC' }] }));
    const r = await svc.dist.getRouteInfo(String(a!._id), String(b!._id));
    expect(r).toMatchObject({ available: true, distanceKm: 327.3, source: 'osrm', polyline: '_p~iF~ps|U_ulLnnqC' });
    expect(r.durationMin).toBe(Math.round(247 * svc.dist.BUS_TIME_FACTOR));
    expect(String(spy.mock.calls[0][0])).toContain('/route/v1/driving/80.27,13.08;78.7,10.79');
    expect((await svc.dist.getRouteInfo(String(a!._id), String(b!._id))).cached).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    svc.env.env.OSRM_URL = '';
  });
  it('falls through (never fakes data) when OSRM fails and nothing else is configured', async () => {
    const [a, b] = await Promise.all([M.City.findOne({ slug: 'chennai' }), M.City.findOne({ slug: 'trichy' })]);
    await M.RouteDistanceCache.deleteMany({}); svc.dist.resetCaches();
    svc.env.env.OSRM_URL = 'https://osrm.test';
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(osrm({}, 500));
    expect((await svc.dist.getRouteInfo(String(a!._id), String(b!._id))).available).toBe(false);
    spy.mockRestore();
    svc.env.env.OSRM_URL = '';
  });
});

describe('QR payment: scan -> accept / reject page', () => {
  it('QR carries the approval link; accepting places the order exactly once', async () => {
    const h = await hold('f3', [{ seatId: 'D1-1B', gender: 'female' }]);
    expect(h.status).toBe(201);
    const { booking, payment } = await bookAndPay('f3', [{ seatId: 'D1-1B', gender: 'female', name: 'Qr Pax' }], h.body.holdId);
    expect(payment.qr).toMatch(/^data:image\/png;base64,/);
    expect(payment.approveUrl).toContain('/pay/approve/');
    expect(payment.reachable).toBe(true);
    const token = payment.approveUrl.split('/').pop();

    const info = await request(app).get(`/api/payments/approve/${token}`); // public: no login on the scanning phone
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ merchant: 'BusGo South', amount: payment.amount, status: 'created', seats: ['1B'] });
    expect(info.body.pnr).toBeUndefined();

    const a1 = await request(app).post(`/api/payments/approve/${token}`).send({ decision: 'accept' });
    expect(a1.body).toMatchObject({ status: 'success', duplicate: false });
    const a2 = await request(app).post(`/api/payments/approve/${token}`).send({ decision: 'accept' });
    expect(a2.body).toMatchObject({ status: 'success', duplicate: true });
    expect((await M.Booking.findById(booking.id).lean())!.status).toBe('booked');
    expect(await M.EmailJob.countDocuments({ template: 'booking_confirmation', bookingId: booking.id })).toBe(1);
    expect((await request(app).post(`/api/payments/approve/${token}`).send({ decision: 'reject' })).status).toBe(409);
    expect((await request(app).get(`/api/payments/approve/${token}`)).body.pnr).toBeTruthy();
  });

  it('rejecting removes the order and frees the seats; accepting afterwards is refused', async () => {
    const h = await hold('m2', [{ seatId: 'D1-3B', gender: 'male' }]);
    const { booking, payment } = await bookAndPay('m2', [{ seatId: 'D1-3B', gender: 'male', name: 'Rej Pax' }], h.body.holdId);
    const token = payment.approveUrl.split('/').pop();
    const r1 = await request(app).post(`/api/payments/approve/${token}`).send({ decision: 'reject' });
    expect(r1.body).toMatchObject({ status: 'failed', duplicate: false });
    expect((await request(app).post(`/api/payments/approve/${token}`).send({ decision: 'reject' })).body.duplicate).toBe(true);
    expect((await M.Booking.findById(booking.id).lean())!.status).toBe('payment_failed');
    const seat = await M.SeatInventory.findOne({ tripId, seatId: 'D1-3B' }).lean();
    expect(seat!.holdId).toBeFalsy();
    expect((await request(app).get(`/api/trips/${tripId}/seats`)).body.seats['D1-3B'].state).toBe('available');
    expect((await request(app).post(`/api/payments/approve/${token}`).send({ decision: 'accept' })).status).toBe(409);
    expect(await M.EmailJob.countDocuments({ template: 'payment_failed', bookingId: booking.id })).toBe(1);
  });

  it('unknown token and bad decision are rejected', async () => {
    expect((await request(app).get('/api/payments/approve/nope')).status).toBe(404);
    expect((await request(app).post('/api/payments/approve/nope').send({ decision: 'accept' })).status).toBe(404);
    expect((await request(app).post('/api/payments/approve/nope').send({ decision: 'maybe' })).status).toBe(400);
  });
});

describe('AI key failover', () => {
  it('uses the second key when the first fails', async () => {
    const ai = await import('../src/services/ai');
    svc.env.env.GROQ_API_KEY_1 = 'k1';
    svc.env.env.GROQ_API_KEY_2 = 'k2';
    const calls: string[] = [];
    const fake = (async (_u: any, init: any) => {
      calls.push(init.headers.Authorization);
      return calls.length === 1 ? new Response('no', { status: 429 }) : new Response(JSON.stringify({ choices: [{ message: { content: 'hello' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await ai.chatWithFailover([{ role: 'user', content: 'hi' }], fake)).toBe('hello');
    expect(calls).toEqual(['Bearer k1', 'Bearer k2']);
  });
});
