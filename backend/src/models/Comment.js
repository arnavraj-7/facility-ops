import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A note on a ticket. `system` comments are auto-generated (status changes,
 * assignments) so the activity feed and human discussion share one timeline.
 */
const commentSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    ticketId: { type: Schema.Types.ObjectId, ref: 'Ticket', required: true, index: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    body: { type: String, required: true, trim: true, maxLength: 4000 },
    type: { type: String, enum: ['comment', 'system'], default: 'comment' },
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

commentSchema.index({ ticketId: 1, createdAt: 1 });

const Comment = mongoose.model('Comment', commentSchema);
export default Comment;
