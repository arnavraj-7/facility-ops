
import http from 'node:http';
import mongoose from 'mongoose';
import app from './app.js';
import { env } from './config/env.js';
import connectDB from './lib/db.js';
import logger from './lib/logger.js';


await connectDB();

// Start HTTP server
const server = http.createServer(app);

server.listen(env.PORT, () => {
  logger.info(`Server listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
});

// Graceful Shutdown Management
const SHUTDOWN_TIMEOUT_MS = 15000;

async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, starting graceful shutdown`);

  // Fallback timeout to force exit if shutdown takes too long
  const forceExit = setTimeout(() => {
    logger.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  try {
    // Stop accepting new network requests and wait for in-flight requests to finish
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    logger.info('HTTP server closed');

    // Disconnect database cleanly
    await mongoose.connection.close(false);
    logger.info('MongoDB connection closed');

    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    logger.error(`Error during shutdown: ${error.message}`);
    process.exit(1);
  }
}

// Intercept termination signals from Docker/Kubernetes/OS
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Last-line-of-defense process error handlers
// Crash on unrecoverable errors to prevent running in a corrupted state
process.on('uncaughtException', (err) => {
  logger.error(`FATAL uncaughtException: ${err.message}`, err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`FATAL unhandledRejection: ${reason}`);
  process.exit(1);
});