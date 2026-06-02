import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { getDashboard } from '../controllers/analyticsController.js';

const router = Router();

router.get('/dashboard', requireAuth, getDashboard);

export default router;
