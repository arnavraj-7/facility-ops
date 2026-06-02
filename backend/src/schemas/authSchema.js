import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a digit');

export const signupSchema = z
  .object({
    email: z.string().email().toLowerCase().trim(),
    password: passwordSchema,
    name: z.string().min(1).max(100).trim(),
    // Optional org name — a new signup provisions a fresh tenant and becomes its admin.
    organization: z.string().min(2).max(120).trim().optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().email().toLowerCase().trim(),
    password: z.string().min(1).max(128),
  })
  .strict();

// Admin creates a team member (engineer / manager / user) inside their tenant.
export const createMemberSchema = z
  .object({
    email: z.string().email().toLowerCase().trim(),
    password: passwordSchema,
    name: z.string().min(1).max(100).trim(),
    role: z.enum(['user', 'engineer', 'manager', 'admin']),
    team: z.string().max(120).trim().optional(),
  })
  .strict();