import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requireRole } from '../middlewares/requireRole.js';
import { validate } from '../middlewares/validate.js';
import {
  createTicketSchema,
  assignSchema,
  statusSchema,
  approveSchema,
  bulkSchema,
  commentSchema,
} from '../schemas/ticketSchema.js';
import {
  createTicket,
  listTickets,
  getTicket,
  assignEngineer,
  updateStatus,
  approveTicket,
  bulkUpdate,
  listComments,
  addComment,
} from '../controllers/ticketController.js';

const router = Router();

router.use(requireAuth);

// Anyone signed in can raise an issue and list/read tickets (role-scoped in service).
router.post('/', validate({ body: createTicketSchema }), createTicket);
router.get('/', listTickets);

// Bulk ops — managers/admins only (must come before /:id routes).
router.post('/bulk', requireRole('manager', 'admin'), validate({ body: bulkSchema }), bulkUpdate);

router.get('/:id', getTicket);
router.patch('/:id/status', validate({ body: statusSchema }), updateStatus);

// Assignment + AI approval are manager/admin actions.
router.patch(
  '/:id/assign',
  requireRole('manager', 'admin'),
  validate({ body: assignSchema }),
  assignEngineer
);
router.post(
  '/:id/approve',
  requireRole('manager', 'admin'),
  validate({ body: approveSchema }),
  approveTicket
);

// Comments
router.get('/:id/comments', listComments);
router.post('/:id/comments', validate({ body: commentSchema }), addComment);

export default router;
