'use strict';

const { generateCoachingMessage } = require('../../../shared/services/groqClient');
const { paiseToRupees } = require('../../../shared/utils/helpers');

// ─────────────────────────────────────────────────────────────────────────────
// determineCoachingEvent — selects the most impactful event type to coach on
// Based on current credit signals, returns the event with highest urgency
// ─────────────────────────────────────────────────────────────────────────────
const determineCoachingEvent = (creditSignals, scoreResult) => {
  const {
    onTimePaymentStreak,
    missedPaymentsLifetime,
    postpaidUtilizedPaise,
    postpaidLimitPaise,
    postpaidDueDate,
    lastPaymentWasOnTime,
  } = creditSignals;

  const utilRate = postpaidLimitPaise > 0 ? postpaidUtilizedPaise / postpaidLimitPaise : 0;
  const daysUntilDue = postpaidDueDate
    ? Math.ceil((new Date(postpaidDueDate) - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  // Priority order: urgent → motivational → informational
  if (daysUntilDue !== null && daysUntilDue <= 2 && postpaidUtilizedPaise > 0) {
    return 'BILL_DUE_SOON';
  }
  if (!lastPaymentWasOnTime) return 'MISSED_PAYMENT';
  if (utilRate > 0.80) return 'HIGH_UTILIZATION';
  if (onTimePaymentStreak > 0 && onTimePaymentStreak % 5 === 0) return 'STREAK_MILESTONE';
  if (scoreResult?.score >= 80 && scoreResult?.pointsToNext <= 5) return 'LIMIT_INCREASE';
  if (missedPaymentsLifetime === 0 && onTimePaymentStreak >= 3) return 'ON_TIME_PAYMENT';
  return 'WEEKLY_SUMMARY';
};

// ─────────────────────────────────────────────────────────────────────────────
// generateCoaching — main entry point
// Selects event, generates AI message, returns coaching payload
// ─────────────────────────────────────────────────────────────────────────────
const generateCoaching = async (creditSignals, scoreResult, userId) => {
  const event = determineCoachingEvent(creditSignals, scoreResult);

  const signaturesForGroq = {
    score: scoreResult.score,
    streak: creditSignals.onTimePaymentStreak || 0,
    postpaidUtilized: paiseToRupees(creditSignals.postpaidUtilizedPaise || 0),
    postpaidLimit: paiseToRupees(creditSignals.postpaidLimitPaise || 500_000),
  };

  const message = await generateCoachingMessage(signaturesForGroq, event, userId);

  return {
    event,
    message,
    urgency: getUrgency(event),
    cta: getCtaForEvent(event),
    generatedAt: new Date().toISOString(),
  };
};

const getUrgency = (event) => {
  const urgentEvents = ['MISSED_PAYMENT', 'BILL_DUE_SOON', 'HIGH_UTILIZATION'];
  return urgentEvents.includes(event) ? 'HIGH' : 'NORMAL';
};

const getCtaForEvent = (event) => {
  const ctaMap = {
    MISSED_PAYMENT: { label: 'Pay Now', action: 'OPEN_POSTPAID' },
    BILL_DUE_SOON: { label: 'Pay Bill', action: 'OPEN_POSTPAID' },
    HIGH_UTILIZATION: { label: 'Reduce Balance', action: 'OPEN_POSTPAID' },
    STREAK_MILESTONE: { label: 'Keep Going', action: null },
    LIMIT_INCREASE: { label: 'Check Eligibility', action: 'OPEN_LIMIT' },
    ON_TIME_PAYMENT: { label: 'View Score', action: 'OPEN_SCOREUP' },
    WEEKLY_SUMMARY: { label: 'See Details', action: 'OPEN_SCOREUP' },
  };
  return ctaMap[event] || { label: 'View Score', action: 'OPEN_SCOREUP' };
};

module.exports = { generateCoaching, determineCoachingEvent };