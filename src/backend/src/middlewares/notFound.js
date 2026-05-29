// src/middlewares/notFound.js
import AppError from '../utils/AppError.js';

export const notFound = (req, res, next) => {
  // We throw our new custom AppError, which will get caught by the global handler!
  next(AppError.notFound(`${req.method} ${req.originalUrl} not found`));
};