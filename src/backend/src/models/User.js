import mongoose from 'mongoose';

const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email'],
    },
    emailVerifiedAt: { type: Date, default: null },

    passwordHash: {
      type: String,
      required: true,
      select: false, // Never returned unless explicitly asked
    },

    name: { type: String, required: true, trim: true, maxLength: 100 },

    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'deleted'],
      default: 'active',
      index: true,
    },

    // --- Login throttling ---
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },

    // --- 2FA (for future modules) ---
    totpSecret: { type: String, default: null, select: false },
    totpEnabledAt: { type: Date, default: null },

    deletedAt: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.passwordHash;
        delete ret.totpSecret;
        return ret;
      },
    },
  }
);

UserSchema.index({ email: 1, deletedAt: 1 });
UserSchema.index({ createdAt: -1 });

UserSchema.virtual('isLocked').get(function () {
  return this.lockedUntil && this.lockedUntil > new Date();
});

UserSchema.virtual('emailVerified').get(function () {
  return !!this.emailVerifiedAt;
});

UserSchema.statics.findActiveByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase(), deletedAt: null });
};

const User = mongoose.model('User', UserSchema);
export default User;