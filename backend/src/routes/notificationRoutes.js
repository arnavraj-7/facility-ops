import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import {
  listNotifications,
  markRead,
  markAllRead,
  stream,
} from '../controllers/notificationController.js';

const router = Router();

router.get('/stream', requireAuth, stream);
router.get('/', requireAuth, listNotifications);
router.post('/read-all', requireAuth, markAllRead);
router.post('/:id/read', requireAuth, markRead);

export default router;
