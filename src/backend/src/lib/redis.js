import { createClient } from 'redis';
import { env } from '../config/env.js';
import logger from './logger.js';

export const redis = createClient({
  url: env.REDIS_URL,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error(`Redis error: ${err.message}`));
redis.on('end', () => logger.warn('Redis connection closed'));

export const connectRedis = async () => {
  try {
    await redis.connect();
  } catch (error) {
    logger.error(`Failed to connect to Redis: ${error.message}`);
    throw error;
  }
};

export const disconnectRedis = async () => {
  await redis.quit();
};