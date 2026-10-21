import { Schema, model } from 'mongoose';

const bookingSchema = new Schema(
  {
    pnr: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
    operatorId: { type: Schema.Types.ObjectId, ref: 'Operator', required: true },
    holdId: { type: String, required: true },
    groupId: { type: String, required: true },
    holdExpiresAt: Date,
    status: {
      type: String,
      enum: [
        'pending_payment',
        'payment_failed',
        'expired',
        'booked',
        'cancellation_pending',
        'cancelled',
        'refund_processing',
        'refund_completed',
      ],
      default: 'pending_payment',
      index: true,
    },
    boardingPointId: String,
    droppingPointId: String,
    contact: { name: String, email: String, phone: String },
    price: { base: Number, gst: Number, total: Number },
    distanceKm: Number,
    estimateSource: { type: String, enum: ['google', 'osrm', 'ai'] },
    durationMin: Number,
    arrivalTime: Date,
    reminderSent: { type: Boolean, default: false },
  },
  { timestamps: true },
);
export const Booking = model('Booking', bookingSchema);

const bpSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    seatId: { type: String, required: true },
    seatLabel: String,
    name: { type: String, required: true },
    age: { type: Number, required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    fare: Number,
    familyGroupId: String,
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
// Only one ACTIVE passenger per seat per trip (second line of defence next to SeatInventory).
bpSchema.index({ tripId: 1, seatId: 1 }, { unique: true, partialFilterExpression: { active: true } });
export const BookingPassenger = model('BookingPassenger', bpSchema);

const paymentSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    method: { type: String, enum: ['external_redirect'], default: 'external_redirect' },
    reference: { type: String, required: true, unique: true },
    idempotencyKey: { type: String, required: true, unique: true },
    gatewayTxnId: { type: String, unique: true, sparse: true },
    // secret carried by the payment QR code; whoever scans it can accept or reject this payment
    approvalToken: { type: String, unique: true, sparse: true },
    status: { type: String, enum: ['created', 'success', 'failed'], default: 'created' },
    processedEvents: [String],
    failureReason: String,
  },
  { timestamps: true },
);
export const Payment = model('Payment', paymentSchema);

export const Refund = model(
  'Refund',
  new Schema(
    {
      bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
      paymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
      reference: { type: String, required: true, unique: true },
      ticketAmount: Number,
      deduction: Number,
      amount: Number,
      status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
      gatewayRefundId: String,
    },
    { timestamps: true },
  ),
);

export const CancellationRequest = model(
  'CancellationRequest',
  new Schema(
    {
      bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      status: {
        type: String,
        enum: ['pending', 'replaced', 'rejected', 'standard_terms'],
        default: 'pending',
        index: true,
      },
      ticketAmount: Number,
      fee: Number,
      refundAmount: Number,
      cutoffAt: { type: Date, required: true, index: true },
      resolvedAt: Date,
    },
    { timestamps: true },
  ),
);
