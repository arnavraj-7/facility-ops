import mongoose from 'mongoose';

const { Schema } = mongoose;

const AuthTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: {
      type: String,
      required: true,
      enum: ['password_reset', 'email_verification'],
    },
    tokenHash: { type: String, required: true, index: true },
    usedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    requestIp: String,
  },
  { timestamps: true, versionKey: false }
);

AuthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('AuthToken', AuthTokenSchema);