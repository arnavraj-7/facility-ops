import http from 'node:http';
import mongoose from 'mongoose';
import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './lib/db.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';
import logger from './lib/logger.js';
import { startHeartbeat } from './realtime/sse.js';
import { startSlaWorker } from './workers/slaWorker.js';

const startServer = async () => {
  try {
    // Wait for the database to connect FIRST
    await connectDB();
    await connectRedis();
    // Only start the HTTP server if the database connection was successful
    const server = http.createServer(app);
    
    server.listen(env.PORT, () => {
      logger.info(`Server listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });

    // Background services
    startHeartbeat(); // keep SSE connections alive through proxies
    startSlaWorker(); // periodically flag SLA breaches

    //  Graceful Shutdown Management 
    const SHUTDOWN_TIMEOUT_MS = 15000;

    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, starting graceful shutdown`);

      const forceExit = setTimeout(() => {
        logger.error('Shutdown timed out, forcing exit');
        process.exit(1);
      }, SHUTDOWN_TIMEOUT_MS).unref();

      try {
        await new Promise((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        });
        logger.info('HTTP server closed');

        await mongoose.connection.close(false);
        logger.info('MongoDB connection closed');
        await disconnectRedis();
        logger.info('Redis connection closed');

        clearTimeout(forceExit);
        process.exit(0);
      } catch (error) {
        logger.error(`Error during shutdown: ${error.message}`);
        process.exit(1);
      }
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

// Last-line-of-defense process error handlers
process.on('uncaughtException', (err) => {
  logger.error(`FATAL uncaughtException: ${err.message}`, err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`FATAL unhandledRejection: ${reason}`);
  process.exit(1);
});

startServer();