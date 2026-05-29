import mongoose from 'mongoose';

const { Schema } = mongoose;

const LoginAttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    email: { type: String, index: true }, 
    success: { type: Boolean, required: true, index: true },
    ip: { type: String, required: true, index: true },
    ipSubnet: String, 
    userAgent: String,
    uaHash: String, 
    deviceLabel: String,
    country: String,
    region: String,
    city: String,
    lat: Number,
    lng: Number,
    score: { type: Number, default: 0 },
    reasons: [String], 
    requiredStepUp: { type: Boolean, default: false },
    requestId: String,
  },
  { timestamps: true, versionKey: false }
);

// Keep 90 days of history, then auto-delete for privacy
LoginAttemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
LoginAttemptSchema.index({ userId: 1, createdAt: -1 });
LoginAttemptSchema.index({ ip: 1, createdAt: -1 });

export default mongoose.model('LoginAttempt', LoginAttemptSchema);