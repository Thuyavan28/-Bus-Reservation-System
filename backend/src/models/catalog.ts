import { Schema, model } from 'mongoose';

const pointSchema = new Schema(
  {
    name: { type: String, required: true },
    landmark: { type: String, default: '' },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    kind: { type: String, enum: ['boarding', 'dropping', 'both'], default: 'both' },
  },
  { _id: true },
);

export const City = model(
  'City',
  new Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    state: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    aliases: [String],
    source: { type: String, enum: ['builtin', 'ai'], default: 'builtin' },
    points: [pointSchema],
  }),
);

const policySchema = new Schema(
  {
    cancellationFee: { type: Number, default: 50 },
    cutoffHoursBeforeDeparture: { type: Number, default: 2 },
    fallbackPolicy: { type: String, enum: ['reject', 'standard_terms'], default: 'standard_terms' },
    standardRefundPercent: { type: Number, default: 50 },
    holdMinutes: { type: Number, default: 8, min: 5, max: 10 },
    gender: {
      enforce: { type: Boolean, default: true },
      femaleAdjacentRestricted: { type: Boolean, default: true },
      allowSameBookingAdjacent: { type: Boolean, default: true },
    },
  },
  { _id: false },
);

export const Operator = model(
  'Operator',
  new Schema(
    {
      name: { type: String, required: true },
      kind: { type: String, enum: ['government', 'private'], default: 'private' },
      contactEmail: String,
      policy: { type: policySchema, default: () => ({}) },
    },
    { timestamps: true },
  ),
);

const seatSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: ['seater', 'sleeper'], required: true },
    position: { row: Number, col: Number },
    deck: { type: Number, required: true },
    window: { type: Boolean, default: false },
    ladiesOnly: { type: Boolean, default: false },
  },
  { _id: false },
);

export const Bus = model(
  'Bus',
  new Schema(
    {
      operatorId: { type: Schema.Types.ObjectId, ref: 'Operator', required: true, index: true },
      name: { type: String, required: true },
      registration: { type: String, required: true },
      busType: { type: String, enum: ['seater', 'sleeper', 'double-decker', 'hybrid'], required: true },
      ac: { type: Boolean, default: true },
      amenities: [String],
      layout: {
        busType: String,
        decks: [
          {
            deck: Number,
            rows: Number,
            columns: Number,
            aislePosition: Number,
            seats: [seatSchema],
            _id: false,
          },
        ],
      },
    },
    { timestamps: true },
  ),
);

export const Route = model(
  'Route',
  new Schema({
    fromCityId: { type: Schema.Types.ObjectId, ref: 'City', required: true },
    toCityId: { type: Schema.Types.ObjectId, ref: 'City', required: true },
    popular: { type: Boolean, default: false },
  }),
);
