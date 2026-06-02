import nodemailer from 'nodemailer';
import { env, isProd } from '../config/env.js';
import logger from './logger.js';

/**
 * Lazily-created SMTP transport. If no SMTP_HOST is configured we run in
 * "log mode" — emails are written to the logger instead of sent. This lets
 * the whole app work end-to-end in local dev without a mail server, while a
 * single env var flips it to real delivery in production.
 */
let transport = null;

const getTransport = () => {
  if (transport) return transport;
  if (!env.SMTP_HOST) return null;

  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT || 587,
    secure: (env.SMTP_PORT || 587) === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transport;
};

export const sendMail = async ({ to, subject, text, html }) => {
  const t = getTransport();

  if (!t) {
    // Log mode (dev / unconfigured prod)
    logger.info(`[MAIL → ${to}] ${subject}\n${(text || html || '').slice(0, 500)}`);
    return { messageId: 'log-mode', delivered: false };
  }

  try {
    const info = await t.sendMail({ from: env.MAIL_FROM, to, subject, text, html });
    logger.info(`[MAIL → ${to}] sent (${info.messageId})`);
    return { messageId: info.messageId, delivered: true };
  } catch (err) {
    logger.error(`[MAIL → ${to}] failed: ${err.message}`);
    if (isProd) return { messageId: null, delivered: false, error: err.message };
    throw err;
  }
};
