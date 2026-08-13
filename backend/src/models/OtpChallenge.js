import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A pending step-up authentication challenge.
 *
 * Redis is the primary store for these (they are short-lived and hot), but the
 * feature must not silently disappear when Redis is unavailable — losing a
 * security control because a cache is down is exactly the wrong failure mode.
 * This collection is the fallback.
 *
 * Only the SHA-256 hash of the code is persisted, never the code itself.
 */
const otpChallengeSchema = new Schema(
  {
    challengeId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    codeHash: { type: String, required: true }, // hex-encoded SHA-256
    attempts: { type: Number, default: 0 },
    fingerprint: { type: String, default: '' },
    riskScore: { type: Number, default: 0 },
    riskReasons: { type: [String], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false }
);

// Mongo clears expired challenges on its own.
otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OtpChallenge = mongoose.model('OtpChallenge', otpChallengeSchema);
export default OtpChallenge;
