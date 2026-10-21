import type { ClientSession } from 'mongoose';
import { AuditLog } from '../models';

export async function audit(
  event: string,
  info: { actorId?: unknown; bookingId?: unknown; tripId?: unknown; data?: unknown } = {},
  session?: ClientSession | null,
) {
  await AuditLog.create(
    [
      {
        event,
        actorId: info.actorId ? String(info.actorId) : undefined,
        bookingId: info.bookingId ? String(info.bookingId) : undefined,
        tripId: info.tripId ? String(info.tripId) : undefined,
        data: info.data,
      },
    ],
    session ? { session } : {},
  );
}
