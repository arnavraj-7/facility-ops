import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { sendToUser } from '../realtime/sse.js';
import { sendMail } from '../lib/mailer.js';
import logger from '../lib/logger.js';

/**
 * Create a persisted notification for one user, push it live over SSE, and
 * (optionally) fire an email alert. Failures here never block the request that
 * triggered them — notifications are best-effort side effects.
 */
export const notifyUser = async ({
  tenantId,
  userId,
  type,
  title,
  body = '',
  ticketId = null,
  email = false,
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

    if (email) {
      // Look up the address only when we actually intend to email.
      const recipient = await User.findById(userId).select('email').lean();
      if (recipient?.email) {
        sendMail({ to: recipient.email, subject: title, text: body }).catch(() => {});
      }
    }

    return notification;
  } catch (err) {
    logger.error(`notifyUser failed: ${err.message}`);
    return null;
  }
};

/**
 * Notify every manager/admin in a tenant — used for approval queues and
 * SLA-breach escalations.
 */
export const notifyManagers = async ({ tenantId, type, title, body, ticketId, email = false }) => {
  const managers = await User.find({
    tenantId,
    role: { $in: ['manager', 'admin'] },
    deletedAt: null,
  })
    .select('_id')
    .lean();

  await Promise.all(
    managers.map((m) =>
      notifyUser({ tenantId, userId: m._id, type, title, body, ticketId, email })
    )
  );
};
