/**
 * Shared domain constants for the Facility Ops Hub.
 * Kept in one place so backend logic and seed data never drift apart.
 */

export const ROLES = ['user', 'engineer', 'manager', 'admin'];

export const TICKET_STATUSES = [
  'open', // raised, not yet picked up
  'assigned', // an engineer has been assigned
  'in_progress', // engineer actively working
  'pending_approval', // AI flagged it; waiting on a manager
  'resolved', // fix applied, awaiting requester confirmation
  'closed', // done
];

export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'critical'];

export const TICKET_CATEGORIES = [
  'Teleportation',
  'Database',
  'Network',
  'Hardware',
  'General',
];

export const TEAMS = [
  'Database_Admin_Squad',
  'Network_Infrastructure_Team',
  'Core_Platform_Engineers',
  'Field_Hardware_Technicians',
  'General_Support',
];

/**
 * SLA resolution targets, in minutes, keyed by priority.
 * slaDueAt = createdAt + SLA_MINUTES[priority].
 */
export const SLA_MINUTES = {
  critical: 60, // 1 hour
  high: 4 * 60, // 4 hours
  medium: 24 * 60, // 1 day
  low: 72 * 60, // 3 days
};

export const NOTIFICATION_TYPES = [
  'ticket_created',
  'ticket_assigned',
  'status_changed',
  'comment_added',
  'approval_required',
  'sla_breach',
];
