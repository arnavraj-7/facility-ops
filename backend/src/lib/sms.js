import { env } from '../config/env.js';
import logger from './logger.js';

/**
 * SMS alerts. Twilio-ready but dependency-free: when Twilio credentials are
 * absent we log the message instead of sending. Wiring real Twilio is a drop-in
 * (add the `twilio` package and replace the body of the configured branch).
 */
export const sendSms = async ({ to, body }) => {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_FROM) {
    logger.info(`[SMS → ${to}] ${body}`);
    return { sid: 'log-mode', delivered: false };
  }

  try {
    // Lazy import keeps `twilio` optional at install time.
    const { default: twilio } = await import('twilio');
    const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    const msg = await client.messages.create({ from: env.TWILIO_FROM, to, body });
    return { sid: msg.sid, delivered: true };
  } catch (err) {
    logger.error(`[SMS → ${to}] failed: ${err.message}`);
    return { sid: null, delivered: false, error: err.message };
  }
};
