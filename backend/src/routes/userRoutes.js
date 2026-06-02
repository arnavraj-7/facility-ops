import { Router } from 'express';
import { getUsers, getEngineers, getUserById, createMember } from '../controllers/userController.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { requireRole } from '../middlewares/requireRole.js';
import { validate } from '../middlewares/validate.js';
import { createMemberSchema } from '../schemas/authSchema.js';

const router = Router();

router.use(requireAuth);

router.get('/engineers', requireRole('manager', 'admin'), getEngineers);
router.get('/', requireRole('manager', 'admin'), getUsers);
router.post('/', requireRole('admin'), validate({ body: createMemberSchema }), createMember);
router.get('/:id', requireRole('manager', 'admin'), getUserById);

export default router;
