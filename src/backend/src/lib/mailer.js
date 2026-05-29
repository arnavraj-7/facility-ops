import { isProd } from '../config/env.js';
import logger from './logger.js';

export const sendMail = async ({ to, subject, text, html }) => {
  if (isProd) {
    // Production setup goes here later
    logger.info('Production mailer not yet configured');
    return;
  } 
  
  // Dev - log emails instead of sending
  logger.info(`[MAIL TO -> ${to}] ${subject}\n${text || html}`);
  return { messageId: 'dev-no-send' };
}