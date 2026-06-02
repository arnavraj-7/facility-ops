import { z } from 'zod';
import { TICKET_STATUSES, TICKET_PRIORITIES } from '../config/constants.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const createTicketSchema = z
  .object({
    title: z.string().min(3, 'Title is too short').max(160).trim(),
    description: z.string().min(5, 'Please describe the issue').max(5000).trim(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
  })
  .strict();

export const assignSchema = z.object({ engineerId: objectId }).strict();

export const statusSchema = z
  .object({
    status: z.enum(TICKET_STATUSES),
    note: z.string().max(500).optional(),
  })
  .strict();

export const approveSchema = z
  .object({
    isApproved: z.boolean(),
    correctedTeam: z.string().max(120).optional(),
  })
  .strict();

export const bulkSchema = z
  .object({
    ticketIds: z.array(objectId).min(1, 'Select at least one ticket').max(500),
    action: z.enum(['status', 'priority', 'assign']),
    value: z.string().min(1),
  })
  .strict();

export const commentSchema = z.object({ body: z.string().min(1).max(4000).trim() }).strict();
