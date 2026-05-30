import AppError from '../utils/AppError.js';
import User from '../models/User.js';

export const requireAuth = async (req, res, next) => {
  if (!req.session?.userId) {
    return next(AppError.unauthorized());
  }

  const user = await User.findOne({
    _id: req.session.userId,
    deletedAt: null,
  }).lean();

  if (!user) {
    req.session.destroy(() => {});
    return next(AppError.unauthorized('Session invalid'));
  }
  if (user.status === 'suspended') {
    return next(AppError.forbidden('Account suspended'));
  }

  req.user = user;
  next();
}