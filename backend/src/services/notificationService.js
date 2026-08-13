import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { sendToUser } from '../realtime/sse.js';
import { sendAlert } from '../lib/alerts.js';
import logger from '../lib/logger.js';

/**
 * Create a persisted notification for one user and push it live over SSE.
 * `alert` additionally mirrors it to the alert channel (see lib/alerts.js).
 *
 * Failures never block the request that triggered them — notifications are
 * best-effort side effects of the main write.
 */
export const notifyUser = async ({
  tenantId,
  userId,
  type,
  title,
  body = '',
  ticketId = null,
  alert = false,
}) => {
  try {
    const notification = await Notification.create({
      tenantId,
      userId,
      type,
      title,
      body,
      ticketId,
    });

    sendToUser(userId, 'notification', notification.toJSON());

    if (alert) {
      const recipient = await User.findById(userId).select('email').lean();
      if (recipient?.email) {
        sendAlert({ to: recipient.email, subject: title, body }).catch(() => {});
      }
    }

    return notification;
  } catch (err) {
    logger.error(`notifyUser failed: ${err.message}`);
    return null;
  }
};

/**
 * Notify every manager/admin in a tenant — used for the approval queue and
 * SLA-breach escalations. `exceptUserId` skips the person who caused the
 * event so nobody is notified about their own action.
 */
export const notifyManagers = async ({
  tenantId,
  type,
  title,
  body,
  ticketId,
  alert = false,
  exceptUserId = null,
}) => {
  const managers = await User.find({
    tenantId,
    role: { $in: ['manager', 'admin'] },
    deletedAt: null,
  })
    .select('_id')
    .lean();

  await Promise.all(
    managers
      .filter((m) => !exceptUserId || String(m._id) !== String(exceptUserId))
      .map((m) => notifyUser({ tenantId, userId: m._id, type, title, body, ticketId, alert }))
  );
};
