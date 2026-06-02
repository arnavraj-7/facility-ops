import { SLA_MINUTES } from '../config/constants.js';

/**
 * Given a priority and a start time, return the SLA resolution deadline.
 * Falls back to the "medium" target for any unknown priority.
 */
export const computeSlaDueAt = (priority, from = new Date()) => {
  const minutes = SLA_MINUTES[priority] ?? SLA_MINUTES.medium;
  return new Date(from.getTime() + minutes * 60 * 1000);
};

/**
 * Milliseconds remaining until the SLA breaches (negative once breached).
 */
export const slaMsRemaining = (slaDueAt) => {
  if (!slaDueAt) return null;
  return new Date(slaDueAt).getTime() - Date.now();
};
