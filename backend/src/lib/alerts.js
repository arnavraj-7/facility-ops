import { env } from '../config/env.js';
import logger from './logger.js';

/**
 * Alert channel.
 *
 * Every alert in this app is delivered *in-app*: a Notification document plus a
 * live Server-Sent-Events push to the recipient's open tabs. This module is the
 * "external channel" seam — the single place a real provider (SMTP, SNS,
 * Twilio, Slack…) would be plugged in later.
 *
 * Deliberately provider-free: nothing is sent over the network, there are no
 * API keys to configure, and there is no email-verification flow anywhere in
 * the system. When ALERTS_LOG is on, the alert is mirrored to the server log so
 * it is visible while demoing.
 */
export const sendAlert = async ({ to, subject, body = '', channel = 'inapp' }) => {
  if (env.ALERTS_LOG) {
    logger.info(`[ALERT/${channel} → ${to}] ${subject}${body ? ` — ${body.slice(0, 200)}` : ''}`);
  }
  return { channel, delivered: true, transport: 'in-app' };
};
