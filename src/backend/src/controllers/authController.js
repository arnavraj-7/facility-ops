import * as authService from '../services/authService.js';
import AppError from '../utils/AppError.js';
import { redis } from '../lib/redis.js';
import * as recoveryService from '../services/recoveryService.js';
import * as scoreService from '../services/loginScoreService.js';
import User from '../models/User.js';

export const signup = async (req, res) => {
  const user = await authService.signup(req.validated.body);
  res.status(201).json({ user });
}

export const login = async (req, res, next) => {
  let user;
  let scoreResult = null;

  try {
    user = await authService.login(req.validated.body);
    scoreResult = await scoreService.scoreLogin({
      userId: user.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  } catch (err) {
    await scoreService.recordAttempt({
      email: req.validated.body.email,
      success: false,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      requestId: req.id, // Assuming you have request IDs enabled
    });
    throw err;
  }

  const requiredStepUp = scoreResult.score >= scoreService.SUSPICION_THRESHOLD;

  await scoreService.recordAttempt({
    userId: user.id, email: user.email, success: true,
    ip: req.ip, userAgent: req.get('user-agent'),
    device: scoreResult.device, geo: scoreResult.geo, subnet: scoreResult.subnet,
    score: scoreResult.score, reasons: scoreResult.reasons, requiredStepUp,
    requestId: req.id,
  });

  if (requiredStepUp) {
    await recoveryService.sendOtp({ target: user.email, purpose: 'login_step_up' });

    sendMail({
      to: user.email,
      subject: 'Unusual sign-in attempt',
      text: `We noticed a sign-in from a new location/device:\n\nDevice: ${scoreResult.device.label}\nLocation: ${scoreResult.geo.city || '?'}, ${scoreResult.geo.country || '?'}\nIP: ${req.ip}\n\nIf this was you, enter the verification code we just sent.`,
    }).catch(() => {});

    return res.status(202).json({
      status: 'step_up_required',
      purpose: 'login_step_up',
      score: scoreResult.score,
      reasons: scoreResult.reasons,
    });
  }

  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = user.id;
    req.session.loginAt = new Date().toISOString();
    req.session.userAgent = req.get('user-agent');
    req.session.ip = req.ip;
    req.session.deviceLabel = scoreResult.device.label;

    redis.sAdd(`user:${user.id}:sessions`, req.session.id).catch(() => {});

    req.session.save((err2) => {
      if (err2) return next(err2);
      res.json({ user });
    });
  });
};

export const loginStepUp = async (req, res, next) => {
  const { email, code } = req.validated.body;

  await recoveryService.verifyOtp({ target: email, purpose: 'login_step_up', code });

  const user = await User.findActiveByEmail(email);
  if (!user) throw AppError.unauthorized();

  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = String(user._id);
    req.session.loginAt = new Date().toISOString();
    req.session.userAgent = req.get('user-agent');
    req.session.ip = req.ip;

    redis.sAdd(`user:${user._id}:sessions`, req.session.id).catch(() => {});

    req.session.save((err2) => {
      if (err2) return next(err2);
      res.json({ user });
    });
  });
};

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

export const sendOtp = async (req, res) => {
  const result = await recoveryService.sendOtp(req.validated.body);
  res.json(result);
};

export const verifyOtp = async (req, res) => {
  const result = await recoveryService.verifyOtp(req.validated.body);
  res.json(result);
};

export const requestPasswordReset = async (req, res) => {
  const result = await recoveryService.requestPasswordReset({
    email: req.validated.body.email,
    requestIp: req.ip,
  });
  res.json(result);
};

export const resetPassword = async (req, res) => {
  const result = await recoveryService.resetPassword(req.validated.body);
  res.json(result);
};