import Ticket from '../models/Ticket.js';
import Comment from '../models/Comment.js';
import { notifyUser, notifyManagers } from '../services/notificationService.js';
import logger from '../lib/logger.js';

const CHECK_INTERVAL_MS = 60_000; // every minute
const TERMINAL = ['resolved', 'closed'];

/**
 * Find open tickets that have passed their SLA deadline and haven't been
 * flagged yet, mark them breached, and escalate to managers + the assignee.
 * Runs in-process on an interval — the simplest "worker queue" that satisfies
 * the requirement without standing up a separate broker.
 */
const checkBreaches = async () => {
  const now = new Date();
  const breached = await Ticket.find({
    slaBreached: false,
    slaDueAt: { $lt: now },
    status: { $nin: TERMINAL },
  }).limit(200);

  for (const ticket of breached) {
    ticket.slaBreached = true;
    ticket.statusHistory.push({ to: ticket.status, note: 'SLA breached', at: now });
    await ticket.save();

    Comment.create({
      tenantId: ticket.tenantId,
      ticketId: ticket._id,
      author: null,
      type: 'system',
      body: `SLA breached — resolution target (${ticket.slaDueAt.toISOString()}) passed.`,
    }).catch(() => {});

    await notifyManagers({
      tenantId: ticket.tenantId,
      type: 'sla_breach',
      title: `SLA breached: #${ticket.ticketNumber}`,
      body: `${ticket.title} (${ticket.priority}) missed its resolution SLA.`,
      ticketId: ticket._id,
      alert: true,
    });
    if (ticket.assignedEngineer) {
      await notifyUser({
        tenantId: ticket.tenantId,
        userId: ticket.assignedEngineer,
        type: 'sla_breach',
        title: `SLA breached: #${ticket.ticketNumber}`,
        body: ticket.title,
        ticketId: ticket._id,
        alert: true,
      });
    }
  }

  if (breached.length) logger.warn(`SLA worker flagged ${breached.length} breached ticket(s)`);
};

export const startSlaWorker = () => {
  checkBreaches().catch((e) => logger.error(`SLA worker error: ${e.message}`));
  const timer = setInterval(
    () => checkBreaches().catch((e) => logger.error(`SLA worker error: ${e.message}`)),
    CHECK_INTERVAL_MS
  );
  timer.unref();
  logger.info('SLA breach worker started');
  return timer;
};
