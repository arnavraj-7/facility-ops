import Notification from '../models/Notification.js';
import { addClient, removeClient } from '../realtime/sse.js';

export const listNotifications = async (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 30);
  const filter = { userId: req.user._id };
  if (req.query.unread === 'true') filter.read = false;

  const [docs, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit),
    Notification.countDocuments({ userId: req.user._id, read: false }),
  ]);

  res.json({ notifications: docs.map((n) => n.toJSON()), unread });
};

export const markRead = async (req, res) => {
  await Notification.updateOne(
    { _id: req.params.id, userId: req.user._id },
    { $set: { read: true } }
  );
  res.status(204).end();
};

export const markAllRead = async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, read: false }, { $set: { read: true } });
  res.status(204).end();
};

/**
 * Long-lived Server-Sent-Events connection. The browser opens this with
 * EventSource and receives `notification` events pushed from anywhere in the
 * app via the SSE hub. Auth is enforced upstream by requireAuth.
 */
export const stream = (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering
  });
  res.flushHeaders?.();
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const userId = req.user._id;
  addClient(userId, res);

  req.on('close', () => {
    removeClient(userId, res);
    res.end();
  });
};
