import { Router } from 'express';
import { getUsers, getUserById } from '../controllers/userController.js';
import { validate } from '../middlewares/validate.js';
const router = Router();

router.get('/session-test', (req, res) => {
  // Check if this user already has a 'views' counter in their session
  if (req.session.views) {
    req.session.views++; // Increment it!
    res.status(200).json({
      status: 'success',
      message: `Welcome back! You have visited this route ${req.session.views} times.`,
      sessionId: req.session.id // The unique ID stored in Redis
    });
  } else {
    // First time visitor! Set the counter to 1.
    req.session.views = 1;
    res.status(200).json({
      status: 'success',
      message: 'Welcome for the first time! A new session was just created in Redis.',
      sessionId: req.session.id
    });
  }
});
router.get('/', getUsers);

router.get('/:id', getUserById);



export default router;