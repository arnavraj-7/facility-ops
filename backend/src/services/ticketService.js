import mongoose from 'mongoose';
import Ticket from '../models/Ticket.js';
import Comment from '../models/Comment.js';
import Counter from '../models/Counter.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { computeSlaDueAt } from '../lib/sla.js';
import { dispatchTicket, resumeTicket } from './aiClient.js';
import { notifyUser, notifyManagers } from './notificationService.js';

const TERMINAL = ['resolved', 'closed'];

/** Record a system comment so the activity feed captures every change. */
const systemComment = (tenantId, ticketId, body) =>
  Comment.create({ tenantId, ticketId, author: null, body, type: 'system' }).catch(() => {});

/**
 * Restrict the query to what this user is allowed to see:
 *   - user    → only tickets they created
 *   - others  → everything in their tenant
 */
const scopeForUser = (user) => {
  const base = { tenantId: user.tenantId };
  if (user.role === 'user') base.createdBy = user._id;
  return base;
};

// ---------------------------------------------------------------------------
// Create / raise issue
// ---------------------------------------------------------------------------
export const createTicket = async ({ user, title, description, priority }) => {
  const tenantId = user.tenantId;
  const ticketNumber = await Counter.next(`ticket:${tenantId}`);

  // Triage through AI (gracefully falls back to a heuristic if AI is down).
  const ai = await dispatchTicket({ ticketId: ticketNumber, description });
  const finalPriority = priority || ai.routing.priority || 'medium';

  const isPending = ai.status === 'pending_human_approval';
  const status = isPending ? 'pending_approval' : 'open';

  const ticket = await Ticket.create({
    tenantId,
    ticketNumber,
    title,
    description,
    createdBy: user._id,
    status,
    priority: finalPriority,
    category: ai.routing.category,
    summary: ai.routing.summary,
    assignedTeam: ai.routing.assigned_team,
    requiresHardwareDispatch: ai.routing.requires_hardware_dispatch,
    aiRouted: ai.source === 'ai',
    threadId: ai.threadId,
    slaDueAt: computeSlaDueAt(finalPriority),
    statusHistory: [{ to: status, by: user._id, note: 'Ticket raised', at: new Date() }],
  });

  await systemComment(tenantId, ticket._id, `Ticket raised by ${user.name}.`);

  // Stakeholder notifications (best-effort side effects).
  if (isPending) {
    await notifyManagers({
      tenantId,
      type: 'approval_required',
      title: `Approval required: #${ticketNumber}`,
      body: `Critical ticket "${title}" needs manager review before routing.`,
      ticketId: ticket._id,
      email: true,
    });
  } else {
    await notifyManagers({
      tenantId,
      type: 'ticket_created',
      title: `New ticket #${ticketNumber}`,
      body: `${title} — routed to ${ai.routing.assigned_team}.`,
      ticketId: ticket._id,
    });
  }

  return ticket.toJSON();
};

// ---------------------------------------------------------------------------
// List with filters, pagination, role scoping
// ---------------------------------------------------------------------------
export const listTickets = async ({ user, query }) => {
  const filter = scopeForUser(user);

  if (query.status) filter.status = { $in: String(query.status).split(',') };
  if (query.priority) filter.priority = { $in: String(query.priority).split(',') };
  if (query.category) filter.category = query.category;
  if (query.mine === 'true' && user.role === 'engineer') filter.assignedEngineer = user._id;
  if (query.assignedEngineer) filter.assignedEngineer = query.assignedEngineer;
  if (query.unassigned === 'true') filter.assignedEngineer = null;
  if (query.overdue === 'true') {
    filter.slaDueAt = { $lt: new Date() };
    filter.status = { $nin: TERMINAL };
  }
  if (query.search) {
    filter.$or = [
      { title: { $regex: query.search, $options: 'i' } },
      { description: { $regex: query.search, $options: 'i' } },
    ];
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const sortField = ['createdAt', 'slaDueAt', 'priority', 'status'].includes(query.sort)
    ? query.sort
    : 'createdAt';
  const sortDir = query.order === 'asc' ? 1 : -1;

  const [docs, total] = await Promise.all([
    Ticket.find(filter)
      .sort({ [sortField]: sortDir })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name email')
      .populate('assignedEngineer', 'name email team'),
    Ticket.countDocuments(filter),
  ]);

  // toJSON applies the id transform (and to populated refs) — lean would skip it.
  const tickets = docs.map((d) => d.toJSON());
  return { tickets, total, page, limit, pages: Math.ceil(total / limit) };
};

// ---------------------------------------------------------------------------
// Get one
// ---------------------------------------------------------------------------
export const getTicket = async ({ user, id }) => {
  if (!mongoose.isValidObjectId(id)) throw AppError.badRequest('Invalid ticket id');
  const ticket = await Ticket.findOne({ _id: id, ...scopeForUser(user) })
    .populate('createdBy', 'name email')
    .populate('assignedEngineer', 'name email team');
  if (!ticket) throw AppError.notFound('Ticket not found');
  return ticket.toJSON();
};

// ---------------------------------------------------------------------------
// Assign / reassign an engineer (manager/admin)
// ---------------------------------------------------------------------------
export const assignEngineer = async ({ user, id, engineerId }) => {
  const ticket = await Ticket.findOne({ _id: id, tenantId: user.tenantId });
  if (!ticket) throw AppError.notFound('Ticket not found');

  const engineer = await User.findOne({
    _id: engineerId,
    tenantId: user.tenantId,
    role: 'engineer',
    deletedAt: null,
  }).lean();
  if (!engineer) throw AppError.badRequest('Engineer not found in this tenant');

  ticket.assignedEngineer = engineer._id;
  if (engineer.team) ticket.assignedTeam = engineer.team;
  if (['open', 'pending_approval'].includes(ticket.status)) ticket.status = 'assigned';
  if (!ticket.firstResponseAt) ticket.firstResponseAt = new Date();
  ticket.statusHistory.push({
    to: ticket.status,
    by: user._id,
    note: `Assigned to ${engineer.name}`,
    at: new Date(),
  });
  await ticket.save();

  await systemComment(user.tenantId, ticket._id, `Assigned to ${engineer.name} by ${user.name}.`);
  await notifyUser({
    tenantId: user.tenantId,
    userId: engineer._id,
    type: 'ticket_assigned',
    title: `Assigned to you: #${ticket.ticketNumber}`,
    body: `${ticket.title} (${ticket.priority})`,
    ticketId: ticket._id,
    email: true,
  });

  return getTicket({ user, id });
};

// ---------------------------------------------------------------------------
// Status transition
// ---------------------------------------------------------------------------
export const updateStatus = async ({ user, id, status, note }) => {
  const ticket = await Ticket.findOne({ _id: id, tenantId: user.tenantId });
  if (!ticket) throw AppError.notFound('Ticket not found');

  // Engineers may only move tickets assigned to them.
  if (user.role === 'engineer' && String(ticket.assignedEngineer) !== String(user._id)) {
    throw AppError.forbidden('You can only update tickets assigned to you');
  }

  const from = ticket.status;
  if (from === status) return getTicket({ user, id });

  ticket.status = status;
  if (!ticket.firstResponseAt && !['open', 'pending_approval'].includes(status)) {
    ticket.firstResponseAt = new Date();
  }
  if (status === 'resolved') ticket.resolvedAt = new Date();
  if (status === 'closed') ticket.closedAt = new Date();
  if (!TERMINAL.includes(status)) {
    // reopening clears terminal timestamps
    ticket.resolvedAt = status === 'resolved' ? ticket.resolvedAt : null;
    ticket.closedAt = null;
  }
  ticket.statusHistory.push({ from, to: status, by: user._id, note, at: new Date() });
  await ticket.save();

  await systemComment(
    user.tenantId,
    ticket._id,
    `Status: ${from} → ${status} by ${user.name}${note ? ` (${note})` : ''}.`
  );

  // Tell the requester and the assigned engineer.
  const recipients = new Set([String(ticket.createdBy)]);
  if (ticket.assignedEngineer) recipients.add(String(ticket.assignedEngineer));
  recipients.delete(String(user._id)); // don't notify the actor
  await Promise.all(
    [...recipients].map((uid) =>
      notifyUser({
        tenantId: user.tenantId,
        userId: uid,
        type: 'status_changed',
        title: `#${ticket.ticketNumber} → ${status}`,
        body: `${ticket.title}`,
        ticketId: ticket._id,
        email: TERMINAL.includes(status),
      })
    )
  );

  return getTicket({ user, id });
};

// ---------------------------------------------------------------------------
// Manager approval of an AI-flagged ticket
// ---------------------------------------------------------------------------
export const approveTicket = async ({ user, id, isApproved, correctedTeam }) => {
  const ticket = await Ticket.findOne({ _id: id, tenantId: user.tenantId });
  if (!ticket) throw AppError.notFound('Ticket not found');
  if (ticket.status !== 'pending_approval') {
    throw AppError.badRequest('Ticket is not awaiting approval');
  }

  const decision = await resumeTicket(ticket.threadId, { isApproved, correctedTeam });

  ticket.status = 'open';
  ticket.humanModified = decision.wasHumanModified;
  if (decision.finalTeam) ticket.assignedTeam = decision.finalTeam;
  ticket.statusHistory.push({
    from: 'pending_approval',
    to: 'open',
    by: user._id,
    note: isApproved ? 'Approved AI routing' : `Overridden to ${correctedTeam}`,
    at: new Date(),
  });
  await ticket.save();

  await systemComment(
    user.tenantId,
    ticket._id,
    `${user.name} ${isApproved ? 'approved AI routing' : `re-routed to ${correctedTeam}`}.`
  );
  await notifyUser({
    tenantId: user.tenantId,
    userId: ticket.createdBy,
    type: 'status_changed',
    title: `#${ticket.ticketNumber} approved & routed`,
    body: `Routed to ${ticket.assignedTeam}.`,
    ticketId: ticket._id,
  });

  return getTicket({ user, id });
};

// ---------------------------------------------------------------------------
// Bulk operations (manager/admin)
// ---------------------------------------------------------------------------
export const bulkUpdate = async ({ user, ticketIds, action, value }) => {
  const ids = (ticketIds || []).filter((id) => mongoose.isValidObjectId(id));
  if (ids.length === 0) throw AppError.badRequest('No valid ticket ids provided');
  const base = { _id: { $in: ids }, tenantId: user.tenantId };

  if (action === 'status') {
    const set = { status: value };
    if (value === 'resolved') set.resolvedAt = new Date();
    if (value === 'closed') set.closedAt = new Date();
    const res = await Ticket.updateMany(base, {
      $set: set,
      $push: { statusHistory: { to: value, by: user._id, note: 'Bulk update', at: new Date() } },
    });
    return { matched: res.matchedCount, modified: res.modifiedCount };
  }

  if (action === 'priority') {
    const res = await Ticket.updateMany(base, { $set: { priority: value } });
    return { matched: res.matchedCount, modified: res.modifiedCount };
  }

  if (action === 'assign') {
    const engineer = await User.findOne({
      _id: value,
      tenantId: user.tenantId,
      role: 'engineer',
    }).lean();
    if (!engineer) throw AppError.badRequest('Engineer not found in this tenant');
    const res = await Ticket.updateMany(base, {
      $set: { assignedEngineer: engineer._id, assignedTeam: engineer.team || null, status: 'assigned' },
      $push: {
        statusHistory: { to: 'assigned', by: user._id, note: `Bulk assign to ${engineer.name}`, at: new Date() },
      },
    });
    return { matched: res.matchedCount, modified: res.modifiedCount };
  }

  throw AppError.badRequest(`Unknown bulk action: ${action}`);
};
