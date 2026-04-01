'use strict';

const { calculateProxyScore } = require('./engines/proxyScorer');
const { generateCoaching } = require('./engines/coachingEngine');
const { predictEMIFailure } = require('./engines/emiPredictor');
const User = require('../user/user.model');
const { redis, safeRedis, TTL } = require('../../config/redis');
const { AppError } = require('../../middleware/errorHandler');
const { startTimer, safeJsonParse } = require('../../shared/utils/helpers');

const scoreCacheKey = (userId) => `scoreup:${userId}`;

// ─────────────────────────────────────────────────────────────────────────────
// getScoreForUser — primary ScoreUp read path
// Redis cache first (<5ms) → compute on miss (~50ms)
// ─────────────────────────────────────────────────────────────────────────────
const getScoreForUser = async (userId) => {
  const endTimer = startTimer();

  // ── Cache hit ───────────────────────────────────────────────────────────
  const cached = await safeRedis(() => redis.get(scoreCacheKey(userId)));
  if (cached) {
    const parsed = safeJsonParse(cached);
    if (parsed) {
      console.log(`⚡ [ScoreUp] Cache hit for ${userId} in ${endTimer().toFixed(1)}ms`);
      return { ...parsed, fromCache: true };
    }
  }

  // ── Cache miss — compute from MongoDB ──────────────────────────────────
  const user = await User.findByUserId(userId);
  if (!user) throw AppError.notFound('User');

  const scoreResult = calculateProxyScore({
    ...user.creditSignals,
    accountAgeDays: Math.floor(
      (Date.now() - new Date(user.onboardingDate).getTime()) / (1000 * 60 * 60 * 24)
    ),
    uniqueCategoriesThisMonth: user.financialBaseline?.uniqueCategoriesThisMonth || 3,
    totalTransactions30d: user.financialBaseline?.totalTransactions30d || 10,
  });

  const [coaching, emiAlert] = await Promise.all([
    generateCoaching(user.creditSignals, scoreResult, userId),
    predictEMIFailure(userId, user.creditSignals),
  ]);

  const fullResult = {
    userId,
    ...scoreResult,
    coaching,
    emiAlert: emiAlert.alert ? emiAlert : null,
    streak: user.creditSignals.onTimePaymentStreak || 0,
    totalPoints: user.creditSignals.totalPoints || 0,
    fromCache: false,
    latencyMs: Math.round(endTimer()),
  };

  // Cache for 24 hours
  await safeRedis(() =>
    redis.setex(scoreCacheKey(userId), TTL.SCOREUP_CACHE, JSON.stringify(fullResult))
  );

  // Persist score to MongoDB history (non-blocking)
  setImmediate(() => {
    User.findOneAndUpdate(
      { userId },
      {
        $set: {
          'creditSignals.proxyScore': scoreResult.score,
          'creditSignals.scoreLevel': scoreResult.level,
          'creditSignals.lastComputedAt': new Date(),
        },
        $push: {
          'creditSignals.scoreHistory': {
            $each: [{ score: scoreResult.score, date: new Date() }],
            $slice: -12, // Keep last 12 weeks
          },
        },
      }
    ).catch(console.error);
  });

  return fullResult;
};

// ─────────────────────────────────────────────────────────────────────────────
// recomputeScore — forces fresh computation (used by nightly cron)
// ─────────────────────────────────────────────────────────────────────────────
const recomputeScore = async (userId) => {
  // Invalidate cache first
  await safeRedis(() => redis.del(scoreCacheKey(userId)));
  return getScoreForUser(userId);
};

// ─────────────────────────────────────────────────────────────────────────────
// getScoreHistory — returns the last N score snapshots
// ─────────────────────────────────────────────────────────────────────────────
const getScoreHistory = async (userId, weeks = 8) => {
  const user = await User.findOne({ userId }, { 'creditSignals.scoreHistory': 1 }).lean();
  if (!user) throw AppError.notFound('User');
  const history = (user.creditSignals?.scoreHistory || []).slice(-weeks);
  return { userId, history, weeks };
};

module.exports = { getScoreForUser, recomputeScore, getScoreHistory };