import { Schema, model } from 'mongoose';

export const RouteDistanceCache = model(
  'RouteDistanceCache',
  new Schema({
    key: { type: String, required: true, unique: true },
    distanceKm: Number,
    durationMin: Number,
    polyline: String,
    source: { type: String, enum: ['google', 'osrm', 'ai'], default: 'google' },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 }, // TTL 24h
  }),
);

export const Notification = model(
  'Notification',
  new Schema(
    {
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      title: String,
      body: String,
      kind: String,
      bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
      read: { type: Boolean, default: false },
    },
    { timestamps: true },
  ),
);

// Append-only: updates and deletes are rejected at the model level.
const auditSchema = new Schema(
  {
    event: { type: String, required: true, index: true },
    actorId: String,
    bookingId: String,
    tripId: String,
    data: Schema.Types.Mixed,
    at: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'replaceOne'] as const) {
  auditSchema.pre(op as 'updateOne', function () {
    throw new Error('AuditLog is append-only');
  });
}
export const AuditLog = model('AuditLog', auditSchema);

export const EmailJob = model(
  'EmailJob',
  new Schema(
    {
      to: { type: String, required: true },
      template: { type: String, required: true },
      bookingId: String,
      data: Schema.Types.Mixed,
      status: { type: String, enum: ['queued', 'sending', 'sent', 'failed', 'logged'], default: 'queued', index: true },
      attempts: { type: Number, default: 0 },
      nextAttemptAt: { type: Date, default: Date.now, index: true },
      lastError: String,
      dedupeKey: { type: String, unique: true, sparse: true },
    },
    { timestamps: true },
  ),
);
