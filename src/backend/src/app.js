import express from 'express'
import logger from './lib/logger.js';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
const app = express();

app.set('trust proxy',1);
app.use(helmet());
app.use(cors({
    origin:env.CORS_ORIGIN || 'http://localhost:5173',
    credentials:true,
}))

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(cookieParser());

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `${req.method} ${req.url} not found`
    }
  });
});

// Global error handler

app.use((err, req, res, next) => {
  const status = err.status || 500;
  
  logger.error(`Unhandled Rejection or Exception: ${err.message}`, { stack: err.stack });
  
  res.status(status).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: status >= 500 ? 'Internal server error' : err.message
    }
  });
});

export default app;