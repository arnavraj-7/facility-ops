import dotenv from 'dotenv'
import {z} from 'zod';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(9000),
  MONGO_URI: z.string().url({ message: "MONGO_URI must be a valid connection string" }),
  CORS_ORIGIN: z.string().url().optional(),
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