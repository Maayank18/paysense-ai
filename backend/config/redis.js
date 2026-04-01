'use strict';

const Redis = require('ioredis');
const env = require('./env');

// ─────────────────────────────────────────────────────────────────────────────
// Redis client configuration
// lazyConnect=true → we connect manually so we can await it at startup
// ─────────────────────────────────────────────────────────────────────────────
const redisConfig = {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 5) {
      console.error('❌  [Redis] Max retry attempts reached. Giving up.');
      return null; // stop retrying
    }
    const delay = Math.min(times * 200, 2_000);
    console.warn(`⚠️   [Redis] Retry attempt ${times} in ${delay}ms…`);
    return delay;
  },
  reconnectOnError: (err) => {
    // Reconnect on READONLY errors (common in Redis Cluster failovers)
    return err.message.includes('READONLY');
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Parse URL for TLS support (Upstash uses rediss://)
// ─────────────────────────────────────────────────────────────────────────────
const createClient = () => {
  const url = env.REDIS_URL;
  // ioredis handles both redis:// and rediss:// URLs natively
  const client = new Redis(url, redisConfig);

  client.on('connect', () => {
    console.log('✅  [Redis] Connected.');
  });

  client.on('ready', () => {
    console.log('✅  [Redis] Client ready — commands will execute.');
  });

  client.on('error', (err) => {
    // Log but don't crash — Redis being down degrades to MongoDB-only path
    console.error('⚠️   [Redis] Client error:', err.message);
  });

  client.on('close', () => {
    console.warn('⚠️   [Redis] Connection closed.');
  });

  return client;
};

const redis = createClient();

// ─────────────────────────────────────────────────────────────────────────────
// Connect function — called at startup
// ─────────────────────────────────────────────────────────────────────────────
const connect = async () => {
  try {
    await redis.connect();
    // Health check
    await redis.ping();
    console.log('✅  [Redis] PING → PONG');
  } catch (err) {
    console.error('❌  [Redis] Failed to connect:', err.message);
    console.warn('    Continuing without Redis — Guardian will fall back to MongoDB.');
    // Don't exit — Redis is degraded path, not hard dependency for demo
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────
const gracefulDisconnect = async () => {
  try {
    await redis.quit();
    console.log('👋  [Redis] Connection closed gracefully.');
  } catch (err) {
    console.error('[Redis] Error during disconnect:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper — safely execute a Redis command with fallback
// Usage: await safeRedis(() => redis.hgetall(key), fallbackValue)
// ─────────────────────────────────────────────────────────────────────────────
const safeRedis = async (fn, fallback = null) => {
  try {
    if (redis.status !== 'ready') return fallback;
    return await fn();
  } catch (err) {
    console.error('[Redis] Command failed:', err.message);
    return fallback;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TTL constants (seconds) — centralized to prevent magic numbers
// ─────────────────────────────────────────────────────────────────────────────
const TTL = Object.freeze({
  USER_FEATURES: 300,        // 5 min — fraud velocity counters
  SCOREUP_CACHE: 86_400,     // 24 hrs — nightly computed score
  GROQ_RESPONSE: 600,        // 10 min — cached AI messages
  SESSION: 3_600,            // 1 hr — Vani dialogue sessions
});

module.exports = { redis, connect, gracefulDisconnect, safeRedis, TTL };