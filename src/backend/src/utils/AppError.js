// src/utils/AppError.js
export default class AppError extends Error {
  constructor(message, status = 500, code, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    // Default to INTERNAL or BAD_REQUEST based on status number
    this.code = code || (status >= 500 ? 'INTERNAL' : 'BAD_REQUEST');
    this.details = details;
    this.isOperational = true; // Tells us this is a known error, not a random bug
    
    // Capture stack trace, but exclude this constructor from it
    Error.captureStackTrace?.(this, this.constructor);
  }


  static badRequest = (msg = 'Bad request', code, details) => 
    new AppError(msg, 400, code || 'BAD_REQUEST', details);

  static unauthorized = (msg = 'Unauthorized', code = 'UNAUTHORIZED') => 
    new AppError(msg, 401, code);

  static forbidden = (msg = 'Forbidden', code = 'FORBIDDEN') => 
    new AppError(msg, 403, code);

  static notFound = (msg = 'Not found', code = 'NOT_FOUND') => 
    new AppError(msg, 404, code);

  static conflict = (msg = 'Conflict', code = 'CONFLICT') => 
    new AppError(msg, 409, code);

  static tooMany = (msg = 'Too many requests', code = 'RATE_LIMITED') => 
    new AppError(msg, 429, code);

  static internal = (msg = 'Internal server error', code = 'INTERNAL') => 
    new AppError(msg, 500, code);
}