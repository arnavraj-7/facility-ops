import Ticket from '../models/Ticket.js';
import { TICKET_STATUSES, TICKET_PRIORITIES } from '../config/constants.js';

const TERMINAL = ['resolved', 'closed'];

/**
 * Aggregate dashboard stats, scoped to the tenant (and to the user's own
 * tickets when they are a plain `user`). One round-trip per metric group;
 * MongoDB aggregation keeps it cheap even with many tickets.
 */
export const getDashboardStats = async ({ user }) => {
  const match = { tenantId: user.tenantId };

  // A requester sees only their own tickets. An engineer sees their queue —
  // plus anything they raised themselves, otherwise a ticket they just filed
  // would vanish from their own dashboard.
  if (user.role === 'user') match.createdBy = user._id;
  if (user.role === 'engineer') {
    match.$or = [{ assignedEngineer: user._id }, { createdBy: user._id }];
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // Bucket the trend by UTC day so the keys we generate below line up exactly
  // with what $dateToString produces (it is UTC unless told otherwise).
  const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  sevenDaysAgo.setUTCHours(0, 0, 0, 0);

  const [byStatus, byPriority, byTeam, overdue, resolvedToday, trend, avgResolution, total] =
    await Promise.all([
      Ticket.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Ticket.aggregate([{ $match: match }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
      Ticket.aggregate([
        { $match: { ...match, assignedTeam: { $ne: null } } },
        { $group: { _id: '$assignedTeam', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Ticket.countDocuments({
        ...match,
        slaDueAt: { $lt: new Date() },
        status: { $nin: TERMINAL },
      }),
      Ticket.countDocuments({ ...match, resolvedAt: { $gte: startOfToday } }),
      Ticket.aggregate([
        { $match: { ...match, createdAt: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            created: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Ticket.aggregate([
        { $match: { ...match, resolvedAt: { $ne: null } } },
        { $project: { ms: { $subtract: ['$resolvedAt', '$createdAt'] } } },
        { $group: { _id: null, avgMs: { $avg: '$ms' } } },
      ]),
      Ticket.countDocuments(match),
    ]);

  // Normalize the grouped arrays into stable, zero-filled maps.
  const toMap = (arr, keys) => {
    const map = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const row of arr) if (row._id != null) map[row._id] = row.count;
    return map;
  };

  const statusMap = toMap(byStatus, TICKET_STATUSES);
  const openCount = total - statusMap.resolved - statusMap.closed;

  // The aggregation only returns days that actually have tickets, which makes
  // the chart jump from "3 days ago" to "today". Zero-fill so the last 7 days
  // are always plotted, in order.
  const counts = Object.fromEntries(trend.map((d) => [d._id, d.created]));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sevenDaysAgo);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    return { date: key, created: counts[key] || 0 };
  });

  return {
    total,
    open: openCount,
    overdue,
    resolvedToday,
    avgResolutionMs: Math.round(avgResolution[0]?.avgMs || 0),
    byStatus: statusMap,
    byPriority: toMap(byPriority, TICKET_PRIORITIES),
    byTeam: byTeam.map((t) => ({ team: t._id, count: t.count })),
    trend: days,
  };
};
