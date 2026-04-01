'use strict';

const Transaction = require('../../transaction/transaction.model');
const { daysAgo, paiseToRupees } = require('../../../shared/utils/helpers');

// ─────────────────────────────────────────────────────────────────────────────
// predictEMIFailure
// 7-day lookahead prediction: will the user have enough balance for their EMI?
// Uses: projected daily spend (from last 7 days) to estimate balance at due date.
//
// Algorithm:
//   1. Calculate avg daily spend from last 7 days transactions
//   2. Project balance 7 days out: estimated_balance = current_balance - (avg_daily * days)
//   3. If projected_balance < next_emi_amount * 1.2 (20% buffer) → HIGH RISK
// ─────────────────────────────────────────────────────────────────────────────
const predictEMIFailure = async (userId, creditSignals) => {
  const {
    postpaidUtilizedPaise = 0,
    postpaidLimitPaise = 500_000,
    postpaidDueDate,
    nextEmiAmountPaise = 0,
  } = creditSignals;

  if (!postpaidDueDate || nextEmiAmountPaise === 0) {
    return { riskLevel: 'UNKNOWN', reason: 'No EMI data available', alert: false };
  }

  const daysUntilDue = Math.ceil(
    (new Date(postpaidDueDate) - Date.now()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilDue < 0) {
    return { riskLevel: 'OVERDUE', reason: 'EMI due date has passed', alert: true, daysUntilDue: 0 };
  }

  // ── Estimate available balance ─────────────────────────────────────────
  // In real system, this would come from banking API.
  // For demo: approximate from Postpaid credit limit - utilized amount
  const approxAvailableBalance = postpaidLimitPaise - postpaidUtilizedPaise;

  // ── Get recent spend rate (last 7 days) ───────────────────────────────
  const recentTxs = await Transaction.find({
    userId,
    status: 'SUCCESS',
    createdAt: { $gte: daysAgo(7) },
    category: { $ne: 'emi_payment' }, // exclude EMI payments from spend calc
  })
    .select('amountPaise')
    .lean();

  const totalRecentSpend = recentTxs.reduce((sum, tx) => sum + tx.amountPaise, 0);
  const avgDailySpendPaise = recentTxs.length > 0 ? totalRecentSpend / 7 : 0;

  // ── Project balance at EMI due date ───────────────────────────────────
  const lookAheadDays = Math.min(daysUntilDue, 7);
  const projectedSpend = avgDailySpendPaise * lookAheadDays;
  const projectedBalance = approxAvailableBalance - projectedSpend;

  // ── Risk assessment ───────────────────────────────────────────────────
  const safetyBuffer = nextEmiAmountPaise * 1.2; // 20% buffer above EMI amount
  const riskLevel =
    projectedBalance < 0 ? 'CRITICAL'
    : projectedBalance < nextEmiAmountPaise ? 'HIGH'
    : projectedBalance < safetyBuffer ? 'MEDIUM'
    : 'LOW';

  const alert = riskLevel === 'CRITICAL' || riskLevel === 'HIGH';

  const amountShortfall =
    projectedBalance < safetyBuffer
      ? Math.max(0, safetyBuffer - projectedBalance)
      : 0;

  return {
    riskLevel,
    alert,
    daysUntilDue,
    nextEmiAmountRupees: paiseToRupees(nextEmiAmountPaise),
    projectedBalanceRupees: paiseToRupees(Math.max(0, projectedBalance)),
    shortfallRupees: amountShortfall > 0 ? paiseToRupees(amountShortfall) : 0,
    avgDailySpendRupees: paiseToRupees(avgDailySpendPaise),
    message: buildAlertMessage(riskLevel, daysUntilDue, amountShortfall),
  };
};

const buildAlertMessage = (riskLevel, daysUntilDue, shortfallPaise) => {
  if (riskLevel === 'CRITICAL') {
    return `⚠️ EMI ${daysUntilDue} din mein due hai lekin balance kam lag raha hai! Abhi ₹${Math.ceil(shortfallPaise / 100)} add karein.`;
  }
  if (riskLevel === 'HIGH') {
    return `EMI ${daysUntilDue} din mein due — aapka projected balance EMI se kam ho sakta hai. Prepare karo.`;
  }
  return null;
};

module.exports = { predictEMIFailure };