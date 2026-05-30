import express from 'express'
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression'

import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { env,isProd } from './config/env.js';
import logger from './lib/logger.js';
import { requestId } from './middlewares/requestID.js';
import { requestLogger } from './middlewares/requestLogger.js';
import { globalLimiter } from './middlewares/rateLimit.js';
import { sessionMiddleware } from './middlewares/session.js';
import userRoutes from './routes/userRoutes.js';
import authRoutes from './routes/authRoutes.js';


const app = express();
// trust proxy
app.set('trust proxy',1);
// observability
app.use(requestId);
app.use(requestLogger);

// security and cors
app.use(helmet());
app.use(cors({
    origin:env.CORS_ORIGIN || 'http://localhost:5173',
    credentials:true,
}))
// compression
app.use(compression());

// body and cookie parsing
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser(env.SESSION_SECRET));

// global rate limiting
app.use(globalLimiter);
app.use(sessionMiddleware)

// routes
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/auth', authRoutes);


// Fallbacks and Errors
app.use(notFound)
app.use(errorHandler)

export default app;