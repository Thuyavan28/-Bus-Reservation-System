import { Schema, model } from 'mongoose';

const stopSchema = new Schema(
  { pointId: String, name: String, landmark: String, lat: Number, lng: Number, time: Date },
  { _id: false },
);

const tripSchema = new Schema(
  {
    operatorId: { type: Schema.Types.ObjectId, ref: 'Operator', required: true, index: true },
    busId: { type: Schema.Types.ObjectId, ref: 'Bus', required: true },
    routeId: { type: Schema.Types.ObjectId, ref: 'Route', required: true },
    fromCityId: { type: Schema.Types.ObjectId, ref: 'City', required: true, index: true },
    toCityId: { type: Schema.Types.ObjectId, ref: 'City', required: true, index: true },
    departureTime: { type: Date, required: true, index: true },
    fares: { seater: { type: Number, default: 0 }, sleeper: { type: Number, default: 0 } },
    boarding: [stopSchema],
    dropping: [stopSchema],
    status: { type: String, enum: ['scheduled', 'running', 'completed', 'cancelled'], default: 'scheduled' },
    // operator = published by an operator; seed / auto = sample data (shown to users as "Demo")
    source: { type: String, enum: ['operator', 'seed', 'auto'], default: 'operator' },
    location: { lat: Number, lng: Number, updatedAt: Date },
  },
  { timestamps: true },
);
tripSchema.index({ fromCityId: 1, toCityId: 1, departureTime: 1, status: 1 });
export const Trip = model('Trip', tripSchema);

// One inventory row per seat per trip. The unique compound index is the hard guarantee
// that a seat can never have two active owners.
const inventorySchema = new Schema(
  {
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    seatId: { type: String, required: true },
    status: {
      type: String,
      enum: ['available', 'booked', 'cancellation_pending', 'unavailable'],
      default: 'available',
    },
    ladiesOnly: { type: Boolean, default: false },
    holdId: String,
    holdUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    holdExpiresAt: Date,
    holdGender: { type: String, enum: ['male', 'female', 'other'] },
    holdFamilyGroupId: String,
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
    // Booking that asked for cancellation and awaits a replacement on this seat.
    pendingCancelBookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
    passengerGender: { type: String, enum: ['male', 'female', 'other'] },
    groupId: String,
    familyGroupId: String,
  },
  { timestamps: true },
);
inventorySchema.index({ tripId: 1, seatId: 1 }, { unique: true });
inventorySchema.index({ holdExpiresAt: 1 });
export const SeatInventory = model('SeatInventory', inventorySchema);
