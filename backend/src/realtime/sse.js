import logger from '../lib/logger.js';

/**
 * In-process Server-Sent-Events hub.
 *
 * Maps a userId -> Set of open Express responses. A single user can have
 * several tabs open, hence a Set per user. This is intentionally in-memory:
 * for a single backend instance it is the simplest correct design. To scale
 * horizontally you would fan out through a Redis pub/sub channel here, but the
 * public API (sendToUser / sendToUsers) would not change.
 */
const clients = new Map(); // userId(string) -> Set<res>

export const addClient = (userId, res) => {
  const key = String(userId);
  if (!clients.has(key)) clients.set(key, new Set());
  clients.get(key).add(res);
  logger.info(`SSE client connected for user ${key} (${clients.get(key).size} open)`);
};

export const removeClient = (userId, res) => {
  const key = String(userId);
  const set = clients.get(key);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(key);
};

export const sendToUser = (userId, event, data) => {
  const set = clients.get(String(userId));
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      /* stale connection; the close handler will clean it up */
    }
  }
};

export const sendToUsers = (userIds, event, data) => {
  for (const id of userIds) sendToUser(id, event, data);
};

/** Heartbeat keeps proxies from closing idle SSE connections. */
export const startHeartbeat = () => {
  setInterval(() => {
    for (const set of clients.values()) {
      for (const res of set) {
        try {
          res.write(': ping\n\n');
        } catch {
          /* ignore */
        }
      }
    }
  }, 25_000).unref();
};
