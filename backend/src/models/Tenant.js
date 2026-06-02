import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A Tenant is one isolated facility / organization (e.g. "Command Center").
 * Every User and Ticket carries a tenantId, and every query is scoped to it,
 * giving us hard multi-tenancy on a shared database.
 */
const tenantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxLength: 120 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers and dashes'],
    },
    status: {
      type: String,
      enum: ['active', 'suspended'],
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  }
);

const Tenant = mongoose.model('Tenant', tenantSchema);
export default Tenant;
