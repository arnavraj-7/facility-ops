import mongoose from 'mongoose';
import {
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  TICKET_CATEGORIES,
} from '../config/constants.js';

const { Schema } = mongoose;

/**
 * One status transition in a ticket's life. Stored inline so the full audit
 * trail travels with the document and the frontend can render a timeline
 * without a second query.
 */
const statusEventSchema = new Schema(
  {
    from: { type: String },
    to: { type: String, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ticketSchema = new Schema(
  {
    // --- Multi-tenancy ---
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },

    // Human-friendly per-tenant sequential number (#1, #2, ...)
    ticketNumber: { type: Number, required: true },

    // --- Core user input ---
    title: { type: String, required: true, trim: true, maxLength: 160 },
    description: { type: String, required: true, maxLength: 5000 },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // --- Lifecycle ---
    status: {
      type: String,
      enum: TICKET_STATUSES,
      default: 'open',
      index: true,
    },
    priority: {
      type: String,
      enum: TICKET_PRIORITIES,
      default: 'medium',
      index: true,
    },
    category: { type: String, enum: TICKET_CATEGORIES, default: 'General' },

    // --- Assignment ---
    assignedEngineer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    assignedTeam: { type: String, default: null },

    // --- AI routing metadata ---
    summary: { type: String },
    requiresHardwareDispatch: { type: Boolean, default: false },
    aiRouted: { type: Boolean, default: false },
    threadId: { type: String, index: true }, // LangGraph human-in-the-loop thread
    humanModified: { type: Boolean, default: false },

    // --- SLA tracking ---
    slaDueAt: { type: Date, index: true },
    slaBreached: { type: Boolean, default: false, index: true },
    firstResponseAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },

    // --- Audit + extras ---
    statusHistory: { type: [statusEventSchema], default: [] },
    tags: { type: [String], default: [] },
    commentCount: { type: Number, default: 0 },
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

// Per-tenant ticket numbers are unique; common board/list queries are covered.
ticketSchema.index({ tenantId: 1, ticketNumber: 1 }, { unique: true });
ticketSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
ticketSchema.index({ tenantId: 1, assignedEngineer: 1, status: 1 });
ticketSchema.index({ tenantId: 1, priority: 1, status: 1 });

// True while the ticket is still open and past its SLA target.
ticketSchema.virtual('isOverdue').get(function () {
  if (!this.slaDueAt) return false;
  const stillOpen = !['resolved', 'closed'].includes(this.status);
  return stillOpen && this.slaDueAt < new Date();
});

const Ticket = mongoose.model('Ticket', ticketSchema);
export default Ticket;
