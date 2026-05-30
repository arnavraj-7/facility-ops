import * as authService from '../services/authService.js';
import AppError from '../utils/AppError.js';
import { redis } from '../lib/redis.js';

export const signup = async (req, res) => {
  const user = await authService.signup(req.validated.body);
  res.status(201).json({ user });
}

export const login = async (req, res, next) => {
  const user = await authService.login(req.validated.body);

  // CRITICAL: Prevent Session Fixation by issuing a new cookie ID on login
  req.session.regenerate((err) => {
    if (err) return next(err);

    req.session.userId = user.id;
    req.session.loginAt = new Date().toISOString();
    req.session.userAgent = req.get('user-agent');
    req.session.ip = req.ip;

    // Track active sessions in Redis
    redis.sAdd(`user:${user.id}:sessions`, req.session.id).catch(() => {});

    req.session.save((err2) => {
      if (err2) return next(err2);
      res.json({ user });
    });
  });
}

export const me = async (req, res) => {
  res.json({ user: req.user });
}

export const logout = async (req, res, next) => {
  const sid = req.session.id;
  const userId = req.session.userId;

  req.session.destroy(async (err) => {
    if (err) return next(err);
    
    if (userId) {
      await redis.sRem(`user:${userId}:sessions`, sid).catch(() => {});
    }
    
    res.clearCookie('sid');
    res.status(204).end();
  });
}