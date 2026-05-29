import mongoose from 'mongoose';

const { Schema } = mongoose;

const OtpSchema = new Schema(
  {
    target: { type: String, required: true, index: true },
    purpose: {
      type: String,
      required: true,
      enum: ['email_verification', 'login_step_up', 'two_factor_setup'],
      index: true,
    },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    usedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false }
);

// MongoDB auto-deletes the document once expiresAt passes!
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
OtpSchema.index({ target: 1, purpose: 1, createdAt: -1 });

export default mongoose.model('Otp', OtpSchema);