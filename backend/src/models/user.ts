import { Schema, model } from 'mongoose';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'operator', 'admin'], default: 'user', index: true },
    operatorId: { type: Schema.Types.ObjectId, ref: 'Operator' },
    age: { type: Number, min: 1, max: 120 },
    language: { type: String, enum: ['en', 'ta', 'ml', 'kn'], default: 'en' },
    refreshTokens: [{ hash: String, expiresAt: Date, _id: false }],
  },
  { timestamps: true },
);
export const User = model('User', userSchema);

const passengerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    age: { type: Number, required: true, min: 1, max: 120 },
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    phone: { type: String, required: true },
    relation: { type: String, default: '' },
    // Family-linked passengers share a familyGroupId so the adjacent-seat rule treats them as one party.
    familyLinked: { type: Boolean, default: false },
  },
  { timestamps: true },
);
export const Passenger = model('Passenger', passengerSchema);

const resetSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});
export const PasswordReset = model('PasswordReset', resetSchema);
