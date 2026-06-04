import dotenv from 'dotenv'
import {z} from 'zod';

dotenv.config();

const bool = (defaultValue) =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((v) => v === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(9000),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  CORS_ORIGIN: z.string().url().optional(),
  SESSION_SECRET: z.string().min(32, 'Session secret must be at least 32 chars'),

  // ── Session store ──────────────────────────────────────────────────────
  // Redis is the production session store. When it is unreachable (or
  // REDIS_ENABLED=false) the server falls back to an in-memory store so the
  // app always boots — handy for a laptop demo with no Redis installed.
  REDIS_ENABLED: bool('true'),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),

  // Override session-cookie Secure flag independently of NODE_ENV. Needed when
  // serving production behind a same-origin reverse proxy over plain HTTP.
  // Defaults to "follow NODE_ENV".
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),

  // Public URL of the frontend (used in CORS default)
  APP_URL: z.string().url().optional(),

  // AI triage microservice (optional — tickets fall back to the built-in
  // keyword triage engine if it is disabled or down)
  AI_MICROSERVICE_URL: z.string().url().default('http://127.0.0.1:8000/api/ai'),
  AI_ENABLED: bool('false'),

  // Alerts are in-app only (notification bell + SSE). This mirrors each alert
  // to the server log so it is visible during a demo. No SMTP, no SMS
  // provider, no third-party service, no email verification.
  ALERTS_LOG: bool('true'),
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
