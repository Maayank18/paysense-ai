'use strict';

const Transaction = require('../../transaction/transaction.model');
const User = require('../../user/user.model');
const { generateSpendInsight } = require('../../../shared/services/groqClient');
const { paiseToRupees, daysAgo } = require('../../../shared/utils/helpers');

// ─────────────────────────────────────────────────────────────────────────────
// getWeeklySpendSummary
// Computes this-week vs last-week spend breakdown per category.
// Returns the diff and top anomaly for Guardian nudge generation.
// ─────────────────────────────────────────────────────────────────────────────
const getWeeklySpendSummary = async (userId) => {
  const now = new Date();
  const weekAgo = daysAgo(7);
  const twoWeeksAgo = daysAgo(14);

  // Aggregate this week and last week in a single pipeline call
  const [thisWeekAgg, lastWeekAgg] = await Promise.all([
    Transaction.aggregate([
      {
        $match: {
          userId,
          status: 'SUCCESS',
          createdAt: { $gte: weekAgo, $lte: now },
        },
      },
      {
        $group: {
          _id: '$category',
          totalPaise: { $sum: '$amountPaise' },
          count: { $sum: 1 },
        },
      },
    ]),
    Transaction.aggregate([
      {
        $match: {
          userId,
          status: 'SUCCESS',
          createdAt: { $gte: twoWeeksAgo, $lt: weekAgo },
        },
      },
      {
        $group: {
          _id: '$category',
          totalPaise: { $sum: '$amountPaise' },
        },
      },
    ]),
  ]);

  // Build lookup maps
  const thisWeekMap = Object.fromEntries(
    thisWeekAgg.map((r) => [r._id, r.totalPaise])
  );
  const lastWeekMap = Object.fromEntries(
    lastWeekAgg.map((r) => [r._id, r.totalPaise])
  );

  const thisWeekTotal = Object.values(thisWeekMap).reduce((a, b) => a + b, 0);
  const lastWeekTotal = Object.values(lastWeekMap).reduce((a, b) => a + b, 0);

  const changePercent = lastWeekTotal > 0
    ? Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100)
    : 0;

  // Find the biggest anomaly (category with highest % increase)
  let topAnomalyCategory = null;
  let maxAnomalyPct = 0;

  for (const [category, thisAmount] of Object.entries(thisWeekMap)) {
    const lastAmount = lastWeekMap[category] || 0;
    if (lastAmount > 0 && thisAmount > lastAmount) {
      const pct = Math.round(((thisAmount - lastAmount) / lastAmount) * 100);
      if (pct > maxAnomalyPct) {
        maxAnomalyPct = pct;
        topAnomalyCategory = { category, pct, thisAmount, lastAmount };
      }
    }
  }

  // Top spending category this week
  const topCategory = thisWeekAgg.sort((a, b) => b.totalPaise - a.totalPaise)[0]?._id || 'other';

  return {
    thisWeekTotalPaise: thisWeekTotal,
    lastWeekTotalPaise: lastWeekTotal,
    thisWeekTotal: paiseToRupees(thisWeekTotal),
    lastWeekTotal: paiseToRupees(lastWeekTotal),
    changePercent,
    topCategory,
    categories: thisWeekMap,
    anomaly: topAnomalyCategory
      ? `${topAnomalyCategory.category}: +${topAnomalyCategory.pct}% vs last week`
      : null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// detectSpendAnomalies — Z-score based detection on category level
// Returns a list of categories with anomalous spend this week
// ─────────────────────────────────────────────────────────────────────────────
const detectSpendAnomalies = async (userId) => {
  const summary = await getWeeklySpendSummary(userId);
  const anomalies = [];

  for (const [category, thisWeekPaise] of Object.entries(summary.categories)) {
    const user = await User.findOne({ userId }, { financialBaseline: 1 }).lean();
    const monthlyAvg = user?.financialBaseline?.categoryTotals?.get?.(category) || 0;

    if (monthlyAvg > 0) {
      const weeklyAvg = monthlyAvg / 4;
      const changeRatio = thisWeekPaise / weeklyAvg;

      if (changeRatio > 1.5) { // 50% above weekly average
        anomalies.push({
          category,
          thisWeekRupees: paiseToRupees(thisWeekPaise),
          weeklyAvgRupees: paiseToRupees(weeklyAvg),
          changePercent: Math.round((changeRatio - 1) * 100),
          severity: changeRatio > 2 ? 'HIGH' : 'MEDIUM',
        });
      }
    }
  }

  return anomalies.sort((a, b) => b.changePercent - a.changePercent);
};

// ─────────────────────────────────────────────────────────────────────────────
// generateWeeklyInsight — orchestrates summary + Groq nudge generation
// ─────────────────────────────────────────────────────────────────────────────
const generateWeeklyInsight = async (userId) => {
  const summary = await getWeeklySpendSummary(userId);
  const message = await generateSpendInsight(summary, userId);

  return {
    message,
    summary: {
      thisWeekTotal: summary.thisWeekTotal,
      lastWeekTotal: summary.lastWeekTotal,
      changePercent: summary.changePercent,
      topCategory: summary.topCategory,
    },
    generatedAt: new Date().toISOString(),
  };
};

module.exports = { getWeeklySpendSummary, detectSpendAnomalies, generateWeeklyInsight };