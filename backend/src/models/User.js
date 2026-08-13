import mongoose from 'mongoose';

const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    // --- Multi-tenancy: every user belongs to exactly one facility/org ---
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email'],
    },
    // NOTE: there is intentionally no email-verification state. An account is
    // usable the moment it is created — either by signup (which provisions a
    // tenant) or by an admin adding a team member.

    passwordHash: {
      type: String,
      required: true,
      select: false, // Never returned unless explicitly asked
    },

    name: { type: String, required: true, trim: true, maxLength: 100 },

    // user      = ranger / requester who raises issues
    // engineer  = fixes assigned tickets
    // manager   = assigns, approves AI routing, sees analytics
    // admin     = full control over the tenant
    role: {
      type: String,
      enum: ['user', 'engineer', 'manager', 'admin'],
      default: 'user',
      index: true,
    },

    // Optional grouping for engineers (maps to AI assignedTeam labels)
    team: { type: String, default: null, trim: true },
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
        // Never let credential material or lockout bookkeeping reach a client.
        delete ret.passwordHash;
        delete ret.failedLoginAttempts;
        delete ret.lockedUntil;
        delete ret.isLocked;
        delete ret.deletedAt;
        return ret;
      },
    },
  }
);

UserSchema.index({ email: 1, deletedAt: 1 });
UserSchema.index({ createdAt: -1 });
// Common dashboard query: list engineers within a tenant
UserSchema.index({ tenantId: 1, role: 1, deletedAt: 1 });

UserSchema.virtual('isLocked').get(function () {
  return this.lockedUntil && this.lockedUntil > new Date();
});

UserSchema.statics.findActiveByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase(), deletedAt: null });
};

const User = mongoose.model('User', UserSchema);
export default User;