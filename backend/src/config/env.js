import dotenv from 'dotenv'
import {z} from 'zod';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(9000),
  MONGO_URI: z.string().url({ message: "MONGO_URI must be a valid connection string" }),
  CORS_ORIGIN: z.string().url().optional(),
  REDIS_URL: z.string().url('REDIS_URL must be a valid connection string'),
  SESSION_SECRET: z.string().min(32, 'Session secret must be at least 32 chars'),

  // Override session-cookie Secure flag independently of NODE_ENV. Needed when
  // serving production behind a same-origin reverse proxy over plain HTTP
  // (e.g. the docker-compose demo). Defaults to "follow NODE_ENV".
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),

  // Public URL of the frontend (used in email links / CORS default)
  APP_URL: z.string().url().optional(),

  // AI triage microservice (optional — tickets fall back to a heuristic if down)
  AI_MICROSERVICE_URL: z.string().url().default('http://127.0.0.1:8000/api/ai'),
  AI_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // SMTP for email alerts (optional — logged to console in dev when unset)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Facility Ops <no-reply@facility-ops.local>'),

  // SMS alerts via Twilio (optional — logged in dev when unset)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(' Invalid environment variables. Server refusing to start:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1); 
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';