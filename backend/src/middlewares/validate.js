// src/middlewares/validate.js
import { ZodError } from 'zod';
import AppError from '../utils/AppError.js';

export const validate = (schemas) => {
  return (req, res, next) => {
    try {
      // Create a fresh, empty object to hold the clean data
      req.validated = {};

      if (schemas.body) {
        req.validated.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        req.validated.query = schemas.query.parse(req.query);
      }
      if (schemas.params) {
        req.validated.params = schemas.params.parse(req.params);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.flatten().fieldErrors;
        next(AppError.badRequest('Validation failed', 'VALIDATION_ERROR', { issues }));
      } else {
        next(error);
      }
    }
  };
};