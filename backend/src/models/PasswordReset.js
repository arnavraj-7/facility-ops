import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A single-use password recovery token.
 *
 * Only the SHA-256 hash of the token is stored — the raw value exists solely
 * in the message delivered to the user. Someone who dumps this collection
 * cannot reset anybody's password with what they find.
 */
const passwordResetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true }, // hex SHA-256
    requestedIp: { type: String, default: '' },
    usedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false }
);

// Expired tokens clean themselves up.
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema);
export default PasswordReset;
