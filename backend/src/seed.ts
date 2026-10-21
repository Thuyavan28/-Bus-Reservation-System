import type { BusType } from '@busgo/shared';
import mongoose from 'mongoose';
import { Bus, City, Operator, Route, SeatInventory, Trip, User } from './models';
import { buildLayout } from './services/layout';
import { hashPassword } from './services/auth';

const CITIES: [string, string, string, number, number, [string, string, number, number][]][] = [
  ['Chennai', 'chennai', 'Tamil Nadu', 13.0827, 80.2707, [['CMBT Koyambedu', 'Gate 3, Koyambedu Bus Terminus', 13.0694, 80.1948], ['Guindy', 'Near Kathipara Flyover', 13.0067, 80.2206], ['Tambaram', 'Tambaram Bus Stand', 12.9249, 80.1]]],
  ['Trichy', 'trichy', 'Tamil Nadu', 10.7905, 78.7047, [['Chatram Bus Stand', 'Central Bus Stand', 10.8271, 78.6929], ['Panjapur', 'Panjapur Bus Terminal', 10.7497, 78.7236]]],
  ['Madurai', 'madurai', 'Tamil Nadu', 9.9252, 78.1198, [['Mattuthavani', 'MGR Bus Stand', 9.9446, 78.1709], ['Periyar', 'Periyar Bus Stand', 9.9161, 78.1153]]],
  ['Coimbatore', 'coimbatore', 'Tamil Nadu', 11.0168, 76.9558, [['Gandhipuram', 'Central Bus Terminus', 11.0183, 76.9725], ['Ukkadam', 'Ukkadam Bus Stand', 10.9902, 76.9608]]],
  ['Salem', 'salem', 'Tamil Nadu', 11.6643, 78.146, [['New Bus Stand', 'Salem New Bus Stand', 11.6769, 78.1394]]],
  ['Tirunelveli', 'tirunelveli', 'Tamil Nadu', 8.7139, 77.7567, [['Tirunelveli Junction', 'New Bus Stand', 8.7316, 77.7108]]],
  ['Bengaluru', 'bengaluru', 'Karnataka', 12.9716, 77.5946, [['Majestic', 'Kempegowda Bus Station', 12.9767, 77.5713], ['Silk Board', 'Silk Board Junction', 12.9174, 77.6228], ['Madiwala', 'Madiwala Check Post', 12.9226, 77.6174]]],
  ['Mysuru', 'mysuru', 'Karnataka', 12.2958, 76.6394, [['Mysuru Suburban', 'KSRTC Suburban Bus Stand', 12.3107, 76.6522]]],
  ['Kochi', 'kochi', 'Kerala', 9.9312, 76.2673, [['Vyttila Hub', 'Vyttila Mobility Hub', 9.9669, 76.3194], ['Edappally', 'Edappally Toll', 10.0261, 76.3084]]],
  ['Thiruvananthapuram', 'thiruvananthapuram', 'Kerala', 8.5241, 76.9366, [['Thampanoor', 'KSRTC Central Bus Station', 8.4895, 76.9526]]],
  ['Kozhikode', 'kozhikode', 'Kerala', 11.2588, 75.7804, [['KSRTC Mofussil', 'Mavoor Road', 11.2588, 75.7885]]],
];

const POPULAR: [string, string][] = [
  ['chennai', 'trichy'], ['chennai', 'madurai'], ['chennai', 'coimbatore'], ['bengaluru', 'chennai'],
  ['bengaluru', 'kochi'], ['coimbatore', 'kochi'], ['madurai', 'thiruvananthapuram'], ['bengaluru', 'mysuru'],
  ['chennai', 'bengaluru'], ['kochi', 'thiruvananthapuram'], ['salem', 'bengaluru'], ['tirunelveli', 'chennai'],
];

export const DEMO = {
  admin: { email: 'admin@busgo.test', password: 'Admin@123' },
  operator: { email: 'operator@busgo.test', password: 'Operator@123' },
  user: { email: 'demo@busgo.test', password: 'Demo@1234' },
};

/**
 * Seeds demo data once. The demo admin is written last, so its presence means a complete seed. If a previous
 * run was interrupted half-way (cities but no admin) and `repair` is set (local dev database only), the
 * catalog is rebuilt instead of being stuck with a partial seed.
 */
export async function seedDatabase({ repair = false }: { repair?: boolean } = {}) {
  if (await User.exists({ email: DEMO.admin.email })) return { skipped: true };
  if (await City.countDocuments()) {
    if (!repair) return { skipped: true };
    console.warn('[seed] found an incomplete earlier seed; rebuilding the demo catalog');
    await Promise.all([City.deleteMany({}), Operator.deleteMany({}), Bus.deleteMany({}), Route.deleteMany({}), Trip.deleteMany({}), SeatInventory.deleteMany({}), User.deleteMany({ email: { $in: [DEMO.operator.email, DEMO.user.email] } })]);
  }
  const cities = await City.insertMany(
    CITIES.map(([name, slug, state, lat, lng, pts]) => ({ name, slug, state, lat, lng, points: pts.map(([n, landmark, la, ln]) => ({ name: n, landmark, lat: la, lng: ln })) })),
  );
  const bySlug = new Map(cities.map((c) => [c.slug, c]));

  const ops = await Operator.insertMany([
    { name: 'TNSTC', kind: 'government', contactEmail: 'ops@tnstc.test', policy: { cancellationFee: 50, fallbackPolicy: 'standard_terms', standardRefundPercent: 50 } },
    { name: 'KSRTC', kind: 'government', contactEmail: 'ops@ksrtc.test', policy: { cancellationFee: 50, fallbackPolicy: 'reject' } },
    { name: 'SETC', kind: 'government', contactEmail: 'ops@setc.test', policy: { cancellationFee: 50 } },
    { name: 'Southern Express (Private)', kind: 'private', contactEmail: 'ops@southern.test', policy: { cancellationFee: 100, standardRefundPercent: 60 } },
  ]);

  const mk = async (opIdx: number, name: string, reg: string, busType: BusType) => {
    const layout = buildLayout(busType, { rows: 9 });
    // first row of the lower deck is reserved for ladies
    layout.decks[0].seats.filter((s) => s.position.row === 0).forEach((s) => (s.ladiesOnly = true));
    return Bus.create({ operatorId: ops[opIdx]._id, name, registration: reg, busType, ac: busType !== 'seater', amenities: ['Charging point', 'Water bottle', 'Reading light'], layout });
  };
  const buses = await Promise.all([
    mk(0, 'TNSTC Ultra Deluxe', 'TN-01-AB-1001', 'seater'),
    mk(1, 'KSRTC Scania Multi-Axle', 'KA-01-F-2002', 'sleeper'),
    mk(2, 'SETC AC Sleeper', 'TN-02-CD-3003', 'sleeper'),
    mk(3, 'Southern Double Decker', 'TN-03-EF-4004', 'double-decker'),
    mk(3, 'Southern Hybrid Express', 'TN-04-GH-5005', 'hybrid'),
  ]);

  const routes: any[] = [];
  for (const [a, b] of POPULAR) {
    for (const [f, t] of [[a, b], [b, a]]) {
      routes.push(await Route.create({ fromCityId: bySlug.get(f)!._id, toCityId: bySlug.get(t)!._id, popular: f === a }));
    }
  }

  const fare = (bus: any) => (bus.busType === 'seater' ? { seater: 450, sleeper: 0 } : bus.busType === 'sleeper' ? { seater: 0, sleeper: 950 } : bus.busType === 'double-decker' ? { seater: 700, sleeper: 0 } : { seater: 600, sleeper: 1100 });
  const stop = (p: any, time: Date | null) => ({ pointId: String(p._id), name: p.name, landmark: p.landmark, lat: p.lat, lng: p.lng, time });

  const slots = [[6, 30], [14, 0], [21, 30], [23, 0]];
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  // Build everything in memory, then write in a few bulk inserts (hundreds of round trips are very slow on Atlas).
  let k = 0;
  const tripDocs: any[] = [];
  const inventory: any[] = [];
  for (let day = 0; day < 7; day++) {
    for (const route of routes) {
      const from = cities.find((c) => String(c._id) === String(route.fromCityId))!;
      const to = cities.find((c) => String(c._id) === String(route.toCityId))!;
      for (let s = 0; s < 2; s++) {
        const [h, m] = slots[(k + s * 2) % slots.length];
        // slot is IST wall time; 05:30 offset to UTC
        const dep = new Date(base.getTime() + day * 864e5 + ((h * 60 + m) - 330) * 60_000);
        const bus: any = buses[(k + s) % buses.length];
        const _id = new mongoose.Types.ObjectId();
        tripDocs.push({
          _id,
          operatorId: bus.operatorId,
          busId: bus._id,
          routeId: route._id,
          fromCityId: from._id,
          toCityId: to._id,
          departureTime: dep,
          source: 'seed',
          fares: fare(bus),
          boarding: from.points.map((p, i) => stop(p, new Date(dep.getTime() - (from.points.length - 1 - i) * 15 * 60_000))),
          dropping: to.points.map((p) => stop(p, null)),
        });
        const layout = bus.layout.toObject ? bus.layout.toObject() : bus.layout;
        for (const d of layout.decks) for (const seat of d.seats) inventory.push({ tripId: _id, seatId: seat.id, ladiesOnly: !!seat.ladiesOnly });
        k++;
      }
    }
  }
  await Trip.insertMany(tripDocs, { ordered: false });
  for (let i = 0; i < inventory.length; i += 2000) await SeatInventory.insertMany(inventory.slice(i, i + 2000), { ordered: false });

  await User.create({ name: 'TNSTC Operator', email: DEMO.operator.email, phone: '9000000002', gender: 'male', age: 40, passwordHash: await hashPassword(DEMO.operator.password), role: 'operator', operatorId: ops[0]._id });
  await User.create({ name: 'Demo Traveller', email: DEMO.user.email, phone: '9000000003', gender: 'female', age: 28, passwordHash: await hashPassword(DEMO.user.password), role: 'user' });
  // written last: its presence marks a complete seed
  await User.create({ name: 'Admin', email: DEMO.admin.email, phone: '9000000001', gender: 'other', age: 35, passwordHash: await hashPassword(DEMO.admin.password), role: 'admin' });
  return { skipped: false, trips: k };
}
