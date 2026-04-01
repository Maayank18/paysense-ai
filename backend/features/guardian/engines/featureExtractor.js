'use strict';

const { redis, safeRedis, TTL } = require('../../../config/redis');
const User = require('../../user/user.model');
const { startTimer } = require('../../../shared/utils/helpers');

// ─────────────────────────────────────────────────────────────────────────────
// Redis key namespace
// ─────────────────────────────────────────────────────────────────────────────
const featureKey = (userId) => `features:${userId}`;

// ─────────────────────────────────────────────────────────────────────────────
// getFeatures — primary read path for Guardian fraud scoring
// Strategy: Redis first (< 5ms) → MongoDB fallback (~20ms)
// Returns a flat object optimized for fraudScorer.js consumption
// ─────────────────────────────────────────────────────────────────────────────
const getFeatures = async (userId) => {
  const endTimer = startTimer();

  // 1. Attempt Redis HGETALL
  const cached = await safeRedis(() => redis.hgetall(featureKey(userId)));

  if (cached && cached.avgTxAmountPaise) {
    const ms = endTimer();
    console.log(`⚡ [FeatureStore] Redis hit for ${userId} in ${ms.toFixed(1)}ms`);

    // Redis stores everything as strings — coerce to numbers
    return {
      avgTxAmountPaise: Number(cached.avgTxAmountPaise),
      stdDevAmountPaise: Number(cached.stdDevAmountPaise),
      txLast1hr: Number(cached.txLast1hr),
      txLast24hr: Number(cached.txLast24hr),
      failedAttempts24hr: Number(cached.failedAttempts24hr),
      lastKnownDeviceId: cached.lastKnownDeviceId,
      lastKnownIp: cached.lastKnownIp,
      fromRedis: true,
      latencyMs: ms,
    };
  }

  // 2. Fallback to MongoDB
  console.warn(`⚠️  [FeatureStore] Redis miss for ${userId} — falling back to MongoDB`);
  const user = await User.findByUserId(userId);

  if (!user) return getDefaultFeatures(userId);

  const features = {
    avgTxAmountPaise: user.financialBaseline.avgTxAmountPaise,
    stdDevAmountPaise: user.financialBaseline.stdDevAmountPaise,
    txLast1hr: user.fraudVelocity.txLast1hr,
    txLast24hr: user.fraudVelocity.txLast24hr,
    failedAttempts24hr: user.fraudVelocity.failedAttempts24hr,
    lastKnownDeviceId: user.fraudVelocity.lastKnownDeviceId,
    lastKnownIp: user.fraudVelocity.lastKnownIp,
    fromRedis: false,
    latencyMs: endTimer(),
  };

  // Backfill Redis for future requests
  await setFeatures(userId, features);
  return features;
};

// ─────────────────────────────────────────────────────────────────────────────
// setFeatures — write user features to Redis Hash
// Called after each transaction to keep feature store current
// ─────────────────────────────────────────────────────────────────────────────
const setFeatures = async (userId, features) => {
  const key = featureKey(userId);
  const payload = {
    avgTxAmountPaise: String(features.avgTxAmountPaise || 50000),
    stdDevAmountPaise: String(features.stdDevAmountPaise || 20000),
    txLast1hr: String(features.txLast1hr || 0),
    txLast24hr: String(features.txLast24hr || 0),
    failedAttempts24hr: String(features.failedAttempts24hr || 0),
    lastKnownDeviceId: features.lastKnownDeviceId || '',
    lastKnownIp: features.lastKnownIp || '',
    updatedAt: new Date().toISOString(),
  };

  await safeRedis(async () => {
    const pipeline = redis.pipeline();
    pipeline.hmset(key, payload);
    pipeline.expire(key, TTL.USER_FEATURES);
    return pipeline.exec();
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// incrementVelocity — atomic counter increment after each transaction
// Uses HINCRBY which is O(1) and non-blocking
// ─────────────────────────────────────────────────────────────────────────────
const incrementVelocity = async (userId) => {
  const key = featureKey(userId);

  await safeRedis(async () => {
    const pipeline = redis.pipeline();
    pipeline.hincrby(key, 'txLast1hr', 1);
    pipeline.hincrby(key, 'txLast24hr', 1);
    pipeline.expire(key, TTL.USER_FEATURES);
    return pipeline.exec();
  });

  // Reset txLast1hr after 1 hour (approximate — production would use sorted sets)
  setTimeout(async () => {
    await safeRedis(() => redis.hincrby(key, 'txLast1hr', -1));
  }, 3_600_000);
};

// ─────────────────────────────────────────────────────────────────────────────
// resetVelocity — reset velocity counters at midnight
// ─────────────────────────────────────────────────────────────────────────────
const resetDailyVelocity = async (userId) => {
  const key = featureKey(userId);
  await safeRedis(() => redis.hmset(key, {
    txLast24hr: '0',
    failedAttempts24hr: '0',
  }));
};

// ─────────────────────────────────────────────────────────────────────────────
// isFirstTimePayee — checks if user has ever paid this UPI ID before
// Uses a Redis SET per user for O(1) membership check
// ─────────────────────────────────────────────────────────────────────────────
const isFirstTimePayee = async (userId, payeeUpi) => {
  const key = `payees:${userId}`;
  const isMember = await safeRedis(() => redis.sismember(key, payeeUpi), null);

  if (isMember === null) {
    // Redis miss — check MongoDB (slower but accurate)
    const user = await User.findOne({ userId }, { frequentPayees: 1 }).lean();
    const knownUpiIds = user?.frequentPayees?.map((p) => p.upiId) || [];
    const isFirst = !knownUpiIds.includes(payeeUpi.toLowerCase());

    // Backfill Redis
    if (knownUpiIds.length > 0) {
      await safeRedis(() => redis.sadd(key, ...knownUpiIds));
      await safeRedis(() => redis.expire(key, 86_400)); // 24h TTL
    }

    return isFirst;
  }

  return isMember === 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// addPayee — mark a UPI ID as known after successful payment
// ─────────────────────────────────────────────────────────────────────────────
const addKnownPayee = async (userId, payeeUpi) => {
  const key = `payees:${userId}`;
  await safeRedis(async () => {
    const pipeline = redis.pipeline();
    pipeline.sadd(key, payeeUpi.toLowerCase());
    pipeline.expire(key, 86_400);
    return pipeline.exec();
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// getDefaultFeatures — safe defaults for new users (cold start)
// ─────────────────────────────────────────────────────────────────────────────
const getDefaultFeatures = (userId) => ({
  avgTxAmountPaise: 50_000,   // ₹500 — conservative default
  stdDevAmountPaise: 20_000,  // ₹200
  txLast1hr: 0,
  txLast24hr: 0,
  failedAttempts24hr: 0,
  lastKnownDeviceId: '',
  lastKnownIp: '',
  fromRedis: false,
  isNewUser: true,
  latencyMs: 0,
});

module.exports = {
  getFeatures,
  setFeatures,
  incrementVelocity,
  resetDailyVelocity,
  isFirstTimePayee,
  addKnownPayee,
  getDefaultFeatures,
};