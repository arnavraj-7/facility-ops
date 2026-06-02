import mongoose from 'mongoose';
import { NOTIFICATION_TYPES } from '../config/constants.js';

const { Schema } = mongoose;

/**
 * A per-user notification. Persisted so the bell icon survives refreshes,
 * and also pushed live over SSE when the recipient has an open stream.
 */
const notificationSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket', default: null },
    read: { type: Boolean, default: false, index: true },
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

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
