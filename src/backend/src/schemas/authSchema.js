import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a digit');

export const signupSchema = z.object({
    email: z.string().email().toLowerCase().trim(),
    password: passwordSchema,
    name: z.string().min(1).max(100).trim(),
  }).strict();

export const loginSchema = z.object({
    email: z.string().email().toLowerCase().trim(),
    password: z.string().min(1).max(128),
  }).strict();

  export const requestOtpSchema = z.object({
  target: z.string().email().toLowerCase().trim(),
  purpose: z.enum(['email_verification', 'login_step_up', 'two_factor_setup']),
}).strict();

export const verifyOtpSchema = z.object({
  target: z.string().email().toLowerCase().trim(),
  purpose: z.enum(['email_verification', 'login_step_up', 'two_factor_setup']),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
}).strict();

export const requestPasswordResetSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
}).strict();

export const resetPasswordSchema = z.object({
  token: z.string().length(64).regex(/^[a-f0-9]+$/, 'Invalid token'),
  newPassword: z
    .string()
    .min(8).max(128)
    .regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
}).strict();

export const loginStepUpSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  code: z.string().regex(/^\d{6}$/),
}).strict();