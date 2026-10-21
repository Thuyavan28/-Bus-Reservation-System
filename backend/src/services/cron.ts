import cron from 'node-cron';
import { Booking, BookingPassenger, Trip } from '../models';
import { expireUnpaidBookings } from './bookingService';
import { applyCancellationFallbacks } from './cancellationService';
import { enqueueEmail, processEmailQueue } from './email';
import { sweepExpiredHolds } from './seatService';

/** Departure reminder: confirmed bookings leaving within 2 hours. Deduped per booking. */
export async function sendDepartureReminders(now = new Date()) {
  const soon = new Date(now.getTime() + 2 * 3_600_000);
  const trips = await Trip.find({ departureTime: { $gt: now, $lte: soon }, status: { $ne: 'cancelled' } }).select('_id').lean();
  if (!trips.length) return 0;
  const bookings = await Booking.find({ tripId: { $in: trips.map((t) => t._id) }, status: 'booked', reminderSent: false });
  for (const b of bookings) {
    await enqueueEmail(b.contact!.email!, 'departure_reminder', b._id, {}, `reminder:${b._id}`);
    b.reminderSent = true;
    await b.save();
  }
  void BookingPassenger;
  return bookings.length;
}

export function startCronJobs() {
  const safe = (name: string, fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
    } catch (e) {
      console.error(`[cron:${name}]`, (e as Error).message);
    }
  };
  cron.schedule('*/30 * * * * *', safe('holds', async () => { await sweepExpiredHolds(); await expireUnpaidBookings(); }));
  cron.schedule('* * * * *', safe('cancellation-fallback', () => applyCancellationFallbacks()));
  cron.schedule('*/5 * * * *', safe('departure-reminders', () => sendDepartureReminders()));
  cron.schedule('*/10 * * * * *', safe('email-queue', () => processEmailQueue()));
  console.log('[cron] jobs started');
}
