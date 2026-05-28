// src/middlewares/errorHandler.js
import { ZodError } from 'zod';
import logger from '../lib/logger.js';
import AppError from '../utils/AppError.js';
import { env, isProd } from '../config/env.js';

// Helper function to figure out what type of error we just caught
const normalize = (err) => {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    const issues = err.flatten().fieldErrors;
    return AppError.badRequest('Validation failed', 'VALIDATION_ERROR', { issues });
  }

  // Handle express express.json() body-parser errors
  if (err.type === 'entity.parse.failed') return AppError.badRequest('Invalid JSON body', 'BAD_JSON');
  if (err.type === 'entity.too.large') return AppError.badRequest('Payload too large', 'PAYLOAD_TOO_LARGE');

  // Handle CORS rejection
  if (err.message?.startsWith('CORS:')) return AppError.forbidden('Origin not allowed', 'CORS_REJECTED');

  // If it's none of the above, it's an unknown bug!
  return AppError.internal(err.message || 'Internal server error');
};

// The actual middleware (MUST have 4 arguments!)
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  const normalized = normalize(err);
  const isServerError = normalized.status >= 500;

  // Log it using our Pino logger
  if (isServerError) {
    logger.error(`[${req.id}] ${req.method} ${req.originalUrl} → ${normalized.status} ${normalized.message}\n${err.stack || ''}`);
  } else {
    logger.warn(`[${req.id}] ${req.method} ${req.originalUrl} → ${normalized.status} ${normalized.code}`);
  }

  // Construct the standardized response body
  const body = {
    error: {
      code: normalized.code,
      message: isServerError && isProd ? 'Internal server error' : normalized.message,
    },
    requestId: req.id,
  };

  if (normalized.details) body.error.details = normalized.details;

  // If we are in development, send the stack trace to Postman to help us debug!
  if (!isProd && isServerError) {
    body.error.stack = err.stack;
  }

  res.status(normalized.status).json(body);
};