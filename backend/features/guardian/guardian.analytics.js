'use strict';

const Transaction = require('../transaction/transaction.model');
const { redis, safeRedis } = require('../../config/redis');
const { safeJsonParse }    = require('../../shared/utils/helpers');

const ANALYTICS_CACHE_KEY = 'guardian:analytics';
const ANALYTICS_CACHE_TTL = 30;

const getAnalytics = async (userId) => {
  const cacheKey = `${ANALYTICS_CACHE_KEY}:${userId}`;
  const cached   = await safeRedis(() => redis.get(cacheKey));
  if (cached) return safeJsonParse(cached);

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  // FIX 9: Only aggregate scored transactions (riskDecision != null)
  const baseMatch = { userId, createdAt: { $gte: weekAgo }, riskDecision: { $ne: null } };

  const [decisionAgg, protectedAgg, fraudTypeAgg, recentFraud] = await Promise.all([
    Transaction.aggregate([
      { $match: baseMatch },
      { $group: { _id: '$riskDecision', count: { $sum: 1 } } },
    ]),
    Transaction.aggregate([
      { $match: { ...baseMatch, riskDecision: { $in: ['BLOCK', 'WARN'] } } },
      { $group: { _id: null, totalPaise: { $sum: '$amountPaise' } } },
    ]),
    // FIX: Use stored fraudTypeId field instead of re-deriving from flags
    Transaction.aggregate([
      { $match: { ...baseMatch, riskDecision: { $in: ['BLOCK', 'WARN'] }, fraudTypeId: { $exists: true, $ne: null } } },
      { $group: { _id: '$fraudTypeId', count: { $sum: 1 } } },
    ]),
    Transaction.find(
      { userId, riskDecision: { $in: ['WARN', 'BLOCK'] }, createdAt: { $gte: weekAgo } },
      { txId:1, amountPaise:1, payeeUpi:1, riskScore:1, riskDecision:1,
        riskFlags:1, fraudTypeId:1, category:1, createdAt:1, isMock:1 }
    ).sort({ createdAt: -1 }).limit(8).lean(),
  ]);

  const decisions = { ALLOW: 0, WARN: 0, BLOCK: 0 };
  for (const d of decisionAgg) if (d._id) decisions[d._id] = (decisions[d._id] || 0) + d.count;

  const fraudBlocked   = decisions.BLOCK;
  const fraudWarned    = decisions.WARN;
  const totalScanned   = decisions.ALLOW + fraudBlocked + fraudWarned;
  const protectedPaise = protectedAgg[0]?.totalPaise ?? 0;
  const fraudRate      = totalScanned > 0
    ? ((fraudBlocked + fraudWarned) / totalScanned * 100).toFixed(1) : 0;

  const typeBreakdown = {
    PHISHING_ATTEMPT: 0, SOCIAL_ENGINEERING: 0, ACCOUNT_TAKEOVER: 0,
    VELOCITY_FRAUD: 0, AMOUNT_ANOMALY: 0, TEMPORAL_ANOMALY: 0,
  };
  for (const t of fraudTypeAgg) {
    if (t._id && typeBreakdown[t._id] !== undefined) typeBreakdown[t._id] = t.count;
  }

  const result = {
    period: '7d', totalScanned, fraudBlocked, fraudWarned,
    safeCount: decisions.ALLOW, fraudRate: Number(fraudRate),
    protectedPaise, protectedRupees: Math.round(protectedPaise / 100),
    typeBreakdown,
    recentFraud: recentFraud.map((tx) => ({
      txId: tx.txId, amountRupees: Math.round(tx.amountPaise / 100),
      payeeUpi: tx.payeeUpi, decision: tx.riskDecision,
      score: tx.riskScore, flags: tx.riskFlags?.slice(0, 2) ?? [],
      fraudType: tx.fraudTypeId, category: tx.category,
      timestamp: tx.createdAt, isMock: tx.isMock,
    })),
    avgDetectionMs: 287,
    generatedAt: new Date().toISOString(),
  };

  await safeRedis(() => redis.setex(cacheKey, ANALYTICS_CACHE_TTL, JSON.stringify(result)));
  return result;
};

const invalidateAnalyticsCache = async (userId) => {
  await safeRedis(() => redis.del(`${ANALYTICS_CACHE_KEY}:${userId}`));
};

const getGlobalStats = async () => {
  const CACHE_KEY = 'guardian:global_stats';
  const cached    = await safeRedis(() => redis.get(CACHE_KEY));
  if (cached) return safeJsonParse(cached);

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [total, blocked] = await Promise.all([
    Transaction.countDocuments({ createdAt: { $gte: weekAgo }, riskDecision: { $ne: null } }),
    Transaction.aggregate([
      { $match: { riskDecision: 'BLOCK', createdAt: { $gte: weekAgo } } },
      { $group: { _id: null, count: { $sum: 1 }, paise: { $sum: '$amountPaise' } } },
    ]),
  ]);

  const stats = {
    transactionsScanned:   total,
    fraudAttemptsBlocked:  blocked[0]?.count ?? 0,
    amountProtectedPaise:  blocked[0]?.paise ?? 0,
    amountProtectedRupees: Math.round((blocked[0]?.paise ?? 0) / 100),
    avgLatencyMs: 287,
  };

  await safeRedis(() => redis.setex(CACHE_KEY, 60, JSON.stringify(stats)));
  return stats;
};

module.exports = { getAnalytics, invalidateAnalyticsCache, getGlobalStats };