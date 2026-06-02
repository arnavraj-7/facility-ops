import AppError from '../utils/AppError.js';

/**
 * Gate a route behind one or more roles. Assumes requireAuth ran first and
 * populated req.user. Usage: router.post('/x', requireAuth, requireRole('manager', 'admin'), handler)
 */
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(AppError.forbidden(`Requires one of: ${roles.join(', ')}`));
  }
  next();
};
