// src/middleware/requestLogger.js
import logger from '../lib/logger.js';

export const requestLogger = (req, res, next) => {
  // Start a high-resolution timer
  const start = process.hrtime.bigint();

  // Wait until the response is fully sent to the client
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    
    const logLine = [
      `[${req.id}]`, // The Request ID we generated in the previous step
      req.method,
      req.originalUrl,
      res.statusCode,
      `${durationMs.toFixed(1)}ms`,
      req.ip
    ].join(' ');

    // Log at the appropriate level based on status code
    if (res.statusCode >= 500) {
      logger.error(logLine);
    } else if (res.statusCode >= 400) {
      logger.warn(logLine);
    } else {
      logger.info(logLine);
    }
  });

  next();
};