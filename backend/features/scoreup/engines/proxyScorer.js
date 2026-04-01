'use strict';

const { SCOREUP } = require('../../../shared/constants');
const { clamp } = require('../../../shared/utils/helpers');

// ─────────────────────────────────────────────────────────────────────────────
// calculateProxyScore
// Computes a 0-100 credit health score from Paytm transaction signals alone.
// No bureau (CIBIL/Experian) dependency — entirely derived from user behavior.
//
// Factor weights mirror CIBIL's published methodology for credibility:
//   Payment History       → 35pts  (CIBIL: 30-40%)
//   Credit Utilization    → 25pts  (CIBIL: 20-30%)
//   Account Age           → 15pts  (CIBIL: 15-21%)
//   Behavioral Diversity  → 15pts  (Paytm-unique alternative signal)
//   Wallet Health         → 10pts  (Paytm-unique signal)
// ─────────────────────────────────────────────────────────────────────────────
const calculateProxyScore = (signals, _skipCounterfactuals = false) => {
  const {
    // Payment behavior
    onTimePaymentStreak = 0,
    missedPaymentsLifetime = 0,
    lastPaymentWasOnTime = true,

    // Credit utilization
    postpaidUtilizedPaise = 0,
    postpaidLimitPaise = 500_000, // ₹5,000 default

    // Account age
    accountAgeDays = 0,

    // Behavioral diversity
    utilityBillRegularity = 0.5,
    uniqueCategoriesThisMonth = 3,
    totalTransactions30d = 10,

    // Wallet health (Paytm-unique)
    walletMaintenanceScore = 0.5,
    fastTagRegularity = 0,
    inboundOutboundRatio = 0.5,
  } = signals;

  const breakdown = {};

  // ── FACTOR 1: PAYMENT HISTORY (35 pts) ────────────────────────────────
  // Each on-time streak payment = +5 pts, each lifetime miss = -8 pts
  // Cap positive contribution so one perfect streak doesn't dominate
  let paymentScore = (onTimePaymentStreak * 5) - (missedPaymentsLifetime * 8);
  if (!lastPaymentWasOnTime) paymentScore -= 10; // recency penalty
  breakdown.paymentHistory = clamp(Math.round(paymentScore), 0, SCOREUP.WEIGHTS.PAYMENT_HISTORY);

  // ── FACTOR 2: CREDIT UTILIZATION (25 pts) ─────────────────────────────
  // Below 30% = full marks. Above 80% = near-zero.
  const utilRate = postpaidLimitPaise > 0 ? postpaidUtilizedPaise / postpaidLimitPaise : 0;
  const utilBracket = SCOREUP.UTIL_BRACKETS;
  breakdown.utilization =
    utilRate <= utilBracket.EXCELLENT.max ? utilBracket.EXCELLENT.score
    : utilRate <= utilBracket.GOOD.max ? utilBracket.GOOD.score
    : utilRate <= utilBracket.FAIR.max ? utilBracket.FAIR.score
    : utilBracket.POOR.score;

  // ── FACTOR 3: ACCOUNT AGE (15 pts) ────────────────────────────────────
  // 3 points per 90 days, capped at 15
  const agePeriods = Math.floor(accountAgeDays / SCOREUP.AGE_DAYS_PER_POINT);
  breakdown.creditAge = clamp(agePeriods * SCOREUP.AGE_POINTS_PER_PERIOD, 0, SCOREUP.WEIGHTS.ACCOUNT_AGE);

  // ── FACTOR 4: BEHAVIORAL DIVERSITY (15 pts) ───────────────────────────
  // Utility bill regularity (0-8 pts) + category diversity (0-7 pts)
  const utilityScore = Math.round(utilityBillRegularity * 8);
  const diversityScore = clamp(uniqueCategoriesThisMonth, 0, 7);
  breakdown.diversity = clamp(utilityScore + diversityScore, 0, SCOREUP.WEIGHTS.BEHAVIORAL_DIVERSITY);

  // ── FACTOR 5: WALLET HEALTH (10 pts) ──────────────────────────────────
  // Wallet maintenance (0-5 pts) + FastTag regularity (0-3 pts) + inbound/outbound balance (0-2 pts)
  const walletScore = Math.round(walletMaintenanceScore * 5);
  const fastTagScore = Math.round((fastTagRegularity || 0) * 3);
  const flowScore = inboundOutboundRatio >= 0.5 ? 2 : 0; // positive inflow is healthy
  breakdown.walletHealth = clamp(walletScore + fastTagScore + flowScore, 0, SCOREUP.WEIGHTS.WALLET_HEALTH);

  // ── TOTAL ─────────────────────────────────────────────────────────────
  const rawScore = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const score = clamp(Math.round(rawScore), 0, 100);

  // ── LEVEL ─────────────────────────────────────────────────────────────
  const level =
    score >= SCOREUP.LEVELS.GOLD ? 'GOLD'
    : score >= SCOREUP.LEVELS.SILVER ? 'SILVER'
    : 'BRONZE';

  // ── NEXT MILESTONE ────────────────────────────────────────────────────
  const nextThreshold = level === 'GOLD' ? 100 : level === 'SILVER' ? SCOREUP.LEVELS.GOLD : SCOREUP.LEVELS.SILVER;
  const pointsToNext = nextThreshold - score;

  // ── TOP IMPROVEMENT RECOMMENDATION ────────────────────────────────────
  const topImprovement = getTopImprovement(breakdown, signals);

  // ── COUNTERFACTUAL: "If you do X, score improves by Y" ────────────────
  const counterfactuals = _skipCounterfactuals ? [] : buildCounterfactuals(signals, breakdown, score);

  return {
    score,
    level,
    breakdown,
    nextThreshold,
    pointsToNext,
    topImprovement,
    counterfactuals,
    computedAt: new Date().toISOString(),
    version: '1.0.0',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// getTopImprovement — identifies the factor with the biggest gap
// ─────────────────────────────────────────────────────────────────────────────
const getTopImprovement = (breakdown, signals) => {
  const gaps = [
    {
      factor: 'paymentHistory',
      gap: SCOREUP.WEIGHTS.PAYMENT_HISTORY - breakdown.paymentHistory,
      label: 'Pay your Postpaid bill on time to improve payment history',
      actionLabel: 'Pay Now',
    },
    {
      factor: 'utilization',
      gap: SCOREUP.WEIGHTS.UTILIZATION - breakdown.utilization,
      label: `Reduce Postpaid utilization below 30% (currently ${Math.round((signals.postpaidUtilizedPaise / signals.postpaidLimitPaise) * 100)}%)`,
      actionLabel: 'Reduce Balance',
    },
    {
      factor: 'diversity',
      gap: SCOREUP.WEIGHTS.BEHAVIORAL_DIVERSITY - breakdown.diversity,
      label: 'Pay utility bills (electricity, gas, water) through Paytm regularly',
      actionLabel: 'Pay Bills',
    },
  ];

  return gaps.sort((a, b) => b.gap - a.gap)[0];
};

// ─────────────────────────────────────────────────────────────────────────────
// buildCounterfactuals — "if you do X, score goes up by Y"
// Simple rule-based approach — no SHAP needed for this demo
// ─────────────────────────────────────────────────────────────────────────────
const buildCounterfactuals = (signals, breakdown, currentScore) => {
  const results = [];

  // Counterfactual 1: Pay off 50% of Postpaid balance
  const halfPayoffSim = {
    ...signals,
    postpaidUtilizedPaise: Math.floor(signals.postpaidUtilizedPaise * 0.5),
  };
  const sim1 = calculateProxyScore(halfPayoffSim, true);
  const gain1 = sim1.score - currentScore;
  if (gain1 > 0) {
    const halfAmount = Math.round(signals.postpaidUtilizedPaise * 0.5 / 100);
    results.push({
      action: `Pay ₹${halfAmount} on your Postpaid balance`,
      scoreImprovement: gain1,
      timeframe: 'Immediate',
    });
  }

  // Counterfactual 2: One more on-time payment (streak +1)
  const streakSim = {
    ...signals,
    onTimePaymentStreak: (signals.onTimePaymentStreak || 0) + 1,
    lastPaymentWasOnTime: true,
  };
  const sim2 = calculateProxyScore(streakSim, true);
  const gain2 = sim2.score - currentScore;
  if (gain2 > 0) {
    results.push({
      action: 'Make your next Postpaid payment on time',
      scoreImprovement: gain2,
      timeframe: 'Next billing cycle',
    });
  }

  // Counterfactual 3: Pay 2 utility bills this month
  const utilSim = {
    ...signals,
    utilityBillRegularity: Math.min(1.0, (signals.utilityBillRegularity || 0.5) + 0.2),
  };
  const sim3 = calculateProxyScore(utilSim);
  const gain3 = sim3.score - currentScore;
  if (gain3 > 0) {
    results.push({
      action: 'Pay electricity and mobile bills through Paytm this month',
      scoreImprovement: gain3,
      timeframe: 'This month',
    });
  }

  return results.sort((a, b) => b.scoreImprovement - a.scoreImprovement).slice(0, 3);
};

module.exports = { calculateProxyScore };