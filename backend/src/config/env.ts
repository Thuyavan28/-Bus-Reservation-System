import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(4000),
  CLIENT_URL: z.string().default('https://bus17.netlify.app').transform((u) => u.replace(/\/+$/, '')),
  SERVER_PUBLIC_URL: z.string().default('https://bus-reservation-system-tau.vercel.app').transform((u) => u.replace(/\/+$/, '')),
  MONGODB_URI: z.string().default(''),
  USE_MEMORY_DB: z.string().default(''),
  JWT_ACCESS_SECRET: z.string().min(8).default('dev-access-secret-change'),
  JWT_REFRESH_SECRET: z.string().min(8).default('dev-refresh-secret-change'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),
  GOOGLE_MAPS_SERVER_KEY: z.string().default(''),
  EMAIL_PROVIDER: z.enum(['smtp', 'resend']).default('smtp'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('BusGo South <thuyavan175@gmail.com>'),
  // External payment website. Empty => the built-in /mock-gateway stand-in is used (dev only).
  EXTERNAL_PAYMENT_URL: z.string().default(''),
  EXTERNAL_REFUND_URL: z.string().default(''),
  // Open-source road routing (real road geometry + distance). Empty disables it.
  OSRM_URL: z.string().default('https://router.project-osrm.org'),
  // Public base URL of the web app, encoded into payment QR codes (use your LAN IP to scan from a phone).
  PUBLIC_APP_URL: z.string().default('https://bus17.netlify.app').transform((u) => u.replace(/\/+$/, '')),
  GROQ_API_KEY_1: z.string().default(''),
  GROQ_API_KEY_2: z.string().default(''),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  PAYMENT_WEBHOOK_SECRET: z.string().default('dev-webhook-secret'),
  HERE_API_KEY_1: z.string().default(''),
  HERE_API_KEY_2: z.string().default(''),
});

export const env = schema.parse(process.env);
export const isProd = env.NODE_ENV === 'production';
