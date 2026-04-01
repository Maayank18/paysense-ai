'use strict';

const rateLimit = require('express-rate-limit');
const { AppError } = require('./errorHandler');

// ─────────────────────────────────────────────────────────────────────────────
// NPCI OC-215 compliance — TPS caps and throttle windows
// Peak hours (10:00-13:00, 17:00-21:30) require stricter caps
// ─────────────────────────────────────────────────────────────────────────────
const isPeakHour = () => {
  const hour = new Date().getHours();
  return (hour >= 10 && hour < 13) || (hour >= 17 && hour < 22);
};

const createLimiter = (options) =>
  rateLimit({
    standardHeaders: true,   // Return RateLimit-* headers
    legacyHeaders: false,     // Disable X-RateLimit-* headers
    handler: (req, res, next, opts) => {
      next(
        AppError.tooManyRequests(
          `Rate limit exceeded. Max ${opts.max} requests per ${Math.round(opts.windowMs / 1000)}s.`
        )
      );
    },
    ...options,
  });

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiters per route category
// ─────────────────────────────────────────────────────────────────────────────

/** General API — 100 req/min */
const apiLimiter = createLimiter({
  windowMs: 60 * 1_000,
  max: 100,
});

/** Guardian scoring — high frequency, but cap at NPCI TPS guidance */
const guardianLimiter = createLimiter({
  windowMs: 10 * 1_000,
  max: () => (isPeakHour() ? 20 : 50), // 20/10s peak, 50/10s off-peak
  keyGenerator: (req) => req.user?.userId || req.ip,
});

/** Vani transcription — Whisper costs money, protect it */
const vaniLimiter = createLimiter({
  windowMs: 60 * 1_000,
  max: 20, // 20 voice requests per minute per user
  keyGenerator: (req) => req.user?.userId || req.ip,
});

/** ScoreUp — infrequent, no real limit needed but add for safety */
const scoreUpLimiter = createLimiter({
  windowMs: 60 * 1_000,
  max: 30,
  keyGenerator: (req) => req.user?.userId || req.ip,
});

/** Auth — strict to prevent brute force */
const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1_000, // 15 minutes
  max: 10,
  skipSuccessfulRequests: true, // Only count failed attempts
});

module.exports = {
  apiLimiter,
  guardianLimiter,
  vaniLimiter,
  scoreUpLimiter,
  authLimiter,
};