'use strict';

const { GUARDIAN } = require('../../../shared/constants');
const { calculateZScore, isLateNight, clamp } = require('../../../shared/utils/helpers');

// ─────────────────────────────────────────────────────────────────────────────
// calculateFraudRisk
// Pure function — no I/O, no side effects, fully synchronous.
// Target execution time: < 1ms (runs between Redis fetch and Groq call)
//
// SHAP-compatible: every score contribution maps to a named flag.
// This satisfies RBI FREE-AI explainability requirements.
// ─────────────────────────────────────────────────────────────────────────────
const calculateFraudRisk = (tx, features) => {
  const { RISK_THRESHOLDS, SCORE_WEIGHTS, Z_SCORE_THRESHOLD, PHISHING_KEYWORDS } = GUARDIAN;

  let score = 0;
  const flags = [];
  const shapValues = []; // SHAP-compatible reason codes

  const addFlag = (flag, weight, condition) => {
    if (condition) {
      score += weight;
      flags.push(flag);
      shapValues.push({ feature: flag, contribution: weight });
    }
  };

  // ── RULE 1: TRANSACTION VELOCITY ─────────────────────────────────────────
  // High frequency of transactions in 1 hour is a strong fraud signal
  addFlag(
    'High transaction velocity in last hour',
    SCORE_WEIGHTS.VELOCITY_1HR,
    features.txLast1hr >= GUARDIAN.VELOCITY_1HR_THRESHOLD
  );

  // ── RULE 2: FIRST-TIME PAYEE ──────────────────────────────────────────────
  // 73% of fraud victims paid a first-time UPI ID (RBI data)
  addFlag(
    'Zero prior transaction history with this UPI ID',
    SCORE_WEIGHTS.FIRST_TIME_PAYEE,
    tx.isFirstTimePayee === true
  );

  // ── RULE 3: AMOUNT ANOMALY (Z-SCORE) ─────────────────────────────────────
  // Statistical outlier — more than 2 standard deviations from user baseline
  const zScore = calculateZScore(
    tx.amountPaise,
    features.avgTxAmountPaise,
    features.stdDevAmountPaise
  );
  if (zScore > Z_SCORE_THRESHOLD) {
    const contribution = zScore > 3 ? SCORE_WEIGHTS.AMOUNT_ANOMALY_Z2 + 10 : SCORE_WEIGHTS.AMOUNT_ANOMALY_Z2;
    score += contribution;
    flags.push(`Amount is ${zScore.toFixed(1)}σ above your normal spending pattern`);
    shapValues.push({ feature: 'amount_anomaly_zscore', contribution, zScore });
  }

  // ── RULE 4: TEMPORAL ANOMALY (LATE NIGHT) ────────────────────────────────
  // Transactions between 12AM-5AM are statistically high-risk
  addFlag(
    'Unusual transaction time (late night)',
    SCORE_WEIGHTS.TEMPORAL_LATE_NIGHT,
    isLateNight()
  );

  // ── RULE 5: PHISHING KEYWORDS IN UPI ID ──────────────────────────────────
  // High-confidence rule — legitimate UPI IDs never contain these words
  const lowerPayeeUpi = (tx.payeeUpi || '').toLowerCase();
  const matchedKeyword = PHISHING_KEYWORDS.find((k) => lowerPayeeUpi.includes(k));
  if (matchedKeyword) {
    score += SCORE_WEIGHTS.PHISHING_KEYWORD;
    flags.push(`Payee UPI contains known phishing keyword: "${matchedKeyword}"`);
    shapValues.push({ feature: 'phishing_keyword', contribution: SCORE_WEIGHTS.PHISHING_KEYWORD, keyword: matchedKeyword });
  }

  // ── RULE 6: DEVICE CHANGE ────────────────────────────────────────────────
  // Logging in from a new device immediately before a transaction is suspicious
  const deviceChanged =
    features.lastKnownDeviceId &&
    tx.deviceId &&
    features.lastKnownDeviceId !== tx.deviceId;
  addFlag(
    'Transaction from unrecognized device',
    SCORE_WEIGHTS.DEVICE_CHANGE,
    deviceChanged
  );

  // ── RULE 7: HIGH ABSOLUTE AMOUNT ─────────────────────────────────────────
  // Transactions above ₹50,000 get an extra flag regardless of baseline
  addFlag(
    'High-value transaction (above ₹50,000)',
    SCORE_WEIGHTS.HIGH_AMOUNT_ABSOLUTE,
    tx.amountPaise >= 5_000_000
  );

  // ── RULE 8: FAILED ATTEMPTS ───────────────────────────────────────────────
  // Multiple failed payment attempts today suggests account enumeration
  addFlag(
    'Multiple failed payment attempts today',
    20,
    features.failedAttempts24hr >= 3
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Finalize score
  // ─────────────────────────────────────────────────────────────────────────
  score = clamp(Math.round(score), 0, GUARDIAN.MAX_SCORE);

  let decision;
  if (score > RISK_THRESHOLDS.WARN) decision = 'BLOCK';
  else if (score > RISK_THRESHOLDS.ALLOW) decision = 'WARN';
  else decision = 'ALLOW';

  return {
    score,
    decision,
    flags,
    shap: shapValues,  // RBI FREE-AI compliant explanation codes
    metadata: {
      zScore: zScore.toFixed(2),
      rulesEvaluated: 8,
      scoringVersion: '1.0.0',
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// getRiskSummary — human-readable summary for API response
// ─────────────────────────────────────────────────────────────────────────────
const getRiskSummary = (result) => {
  const { score, decision } = result;

  const summaries = {
    ALLOW: { color: 'green', label: 'Safe', emoji: '✅', message: 'Transaction appears safe to proceed.' },
    WARN: { color: 'orange', label: 'Caution', emoji: '⚠️', message: 'Please verify before sending.' },
    BLOCK: { color: 'red', label: 'High Risk', emoji: '🚫', message: 'This transaction shows multiple fraud signals.' },
  };

  return { ...summaries[decision], score };
};

module.exports = { calculateFraudRisk, getRiskSummary };