import express from 'express';
import { createAndRouteTicket, managerOverride } from '../controllers/ticketController.js';


import requireAuth from '../middlewares/requireAuth.js';

const router = express.Router();

router.post('/', requireAuth, createAndRouteTicket);

router.post('/approve/:threadId', requireAuth, managerOverride);

export default router;