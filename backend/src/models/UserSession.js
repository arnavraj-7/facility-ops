import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Registry of a user's active sessions — one row per signed-in device.
 *
 * The session *data* lives in the express-session store (Redis in production).
 * This collection is the durable index over it, which is what makes three
 * things possible that a bare Redis store cannot do on its own:
 *
 *   1. Concurrent session limiting — count a user's live devices and evict the
 *      oldest when they exceed the cap.
 *   2. A "your devices" screen with device, location and last-seen columns.
 *   3. Risk-based authentication — the history of devices and locations an
 *      account normally signs in from.
 *
 * Rows are reconciled against the session store (see sessionService.gc), so a
 * session that expired or was evicted in the store never lingers here.
 */
const userSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },

    // The express-session id this row shadows.
    sid: { type: String, required: true, unique: true },

    // Hashed device characteristics — see lib/deviceFingerprint.js
    fingerprint: { type: String, required: true, index: true },
    deviceLabel: { type: String, default: 'Unknown device' },

    ip: { type: String, default: '' },
    geo: {
      country: { type: String, default: 'unknown' },
      city: { type: String, default: 'unknown' },
      lat: { type: Number, default: null },
      lon: { type: Number, default: null },
    },

    // How this session came to exist — useful in the UI and for audit.
    stepUpVerified: { type: Boolean, default: false },
    riskScore: { type: Number, default: 0 },
    riskReasons: { type: [String], default: [] },

    lastSeenAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, required: true },

    // Set when the session was ended, and why. Kept briefly rather than deleted
    // so the risk engine still has location history to compare against.
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.sid; // never expose a session id to a client
        return ret;
      },
    },
  }
);

// Active-session lookups (limiting, listing) hit this constantly.
userSessionSchema.index({ userId: 1, revokedAt: 1, lastSeenAt: -1 });

// Let Mongo clear out long-dead rows on its own. The window is generous so the
// risk engine keeps enough location history to reason about.
userSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const UserSession = mongoose.model('UserSession', userSessionSchema);
export default UserSession;
