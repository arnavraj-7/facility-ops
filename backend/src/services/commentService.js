import mongoose from 'mongoose';
import Comment from '../models/Comment.js';
import Ticket from '../models/Ticket.js';
import AppError from '../utils/AppError.js';
import { notifyUser } from './notificationService.js';

/** Load a ticket the user is allowed to see, or throw. */
const accessibleTicket = async (user, ticketId) => {
  if (!mongoose.isValidObjectId(ticketId)) throw AppError.badRequest('Invalid ticket id');
  const filter = { _id: ticketId, tenantId: user.tenantId };
  if (user.role === 'user') filter.createdBy = user._id;
  const ticket = await Ticket.findOne(filter);
  if (!ticket) throw AppError.notFound('Ticket not found');
  return ticket;
};

export const listComments = async ({ user, ticketId }) => {
  await accessibleTicket(user, ticketId);
  const comments = await Comment.find({ ticketId })
    .sort({ createdAt: 1 })
    .populate('author', 'name email role');
  return comments.map((c) => c.toJSON());
};

export const addComment = async ({ user, ticketId, body }) => {
  const ticket = await accessibleTicket(user, ticketId);

  const comment = await Comment.create({
    tenantId: user.tenantId,
    ticketId,
    author: user._id,
    body,
    type: 'comment',
  });
  await Ticket.updateOne({ _id: ticketId }, { $inc: { commentCount: 1 } });

  // Notify the other stakeholders on the ticket.
  const recipients = new Set([String(ticket.createdBy)]);
  if (ticket.assignedEngineer) recipients.add(String(ticket.assignedEngineer));
  recipients.delete(String(user._id));
  await Promise.all(
    [...recipients].map((uid) =>
      notifyUser({
        tenantId: user.tenantId,
        userId: uid,
        type: 'comment_added',
        title: `New comment on #${ticket.ticketNumber}`,
        body: `${user.name}: ${body.slice(0, 80)}`,
        ticketId: ticket._id,
      })
    )
  );

  const populated = await comment.populate('author', 'name email role');
  return populated.toJSON();
};
