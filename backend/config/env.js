'use strict';

const { z } = require('zod');
require('dotenv').config();

// ─────────────────────────────────────────────────────────────────────────────
// ENV SCHEMA — Every variable is validated at startup.
// If a required variable is missing, the process exits immediately.
// This prevents cryptic runtime errors deep in a request cycle.
// ─────────────────────────────────────────────────────────────────────────────

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  PORT: z
    .string()
    .regex(/^\d+$/, 'PORT must be a numeric string')
    .default('4000')
    .transform(Number),

  CLIENT_URL: z
    .string()
    .url('CLIENT_URL must be a valid URL')
    .default('http://localhost:5173'),

  MONGODB_URI: z
    .string()
    .min(10, 'MONGODB_URI is required')
    .default('mongodb://127.0.0.1:27017/paysense'),

  REDIS_URL: z
    .string()
    .min(8, 'REDIS_URL is required')
    .default('redis://127.0.0.1:6379'),

  GROQ_API_KEY: z
    .string()
    .min(10, 'GROQ_API_KEY is required for AI inference'),

  GROQ_MODEL: z
    .string()
    .default('llama-3.3-70b-versatile'),

  OPENAI_API_KEY: z
    .string()
    .min(10, 'OPENAI_API_KEY is required for Whisper STT'),

  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET must be at least 16 characters'),

  JWT_EXPIRES_IN: z
    .string()
    .default('7d'),

  ENABLE_MOCK_GENERATOR: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  MOCK_TX_INTERVAL_MS: z
    .string()
    .default('3000')
    .transform(Number),

  DEMO_USER_ID: z
    .string()
    .default('usr_demo_mayank_001'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Parse and validate. On failure, print human-readable errors and hard-exit.
// ─────────────────────────────────────────────────────────────────────────────

const _parseResult = envSchema.safeParse(process.env);

if (!_parseResult.success) {
  console.error('\n❌  [ENV] Environment validation failed:');
  _parseResult.error.errors.forEach((e) => {
    console.error(`   • ${e.path.join('.')} — ${e.message}`);
  });
  console.error(
    '\n   Copy .env.example to .env and fill in all required values.\n'
  );
  process.exit(1);
}

const env = Object.freeze(_parseResult.data);

module.exports = env;