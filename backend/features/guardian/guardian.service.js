'use strict';

const { calculateFraudRisk, getRiskSummary } = require('./engines/fraudScorer');
const { getFeatures, isFirstTimePayee, addKnownPayee, incrementVelocity } = require('./engines/featureExtractor');
const { updateProfileOnTransaction, updateFrequentPayee } = require('./engines/profileUpdater');
const { generateGuardianMessage } = require('../../shared/services/groqClient');
const Transaction = require('../transaction/transaction.model');
const { generateTxId, startTimer, isValidUpiId } = require('../../shared/utils/helpers');
const { AppError } = require('../../middleware/errorHandler');

// ─────────────────────────────────────────────────────────────────────────────
// scoreTransaction — the primary Guardian entry point
// Returns risk result. Does NOT block the payment.
// ─────────────────────────────────────────────────────────────────────────────
const scoreTransaction = async ({ userId, tx, deviceId, ipAddress }) => {
  const endTimer = startTimer();

  // ── Validate UPI ID ─────────────────────────────────────────────────────
  if (!isValidUpiId(tx.payeeUpi)) {
    throw AppError.badRequest(`Invalid UPI ID format: ${tx.payeeUpi}`, 'INVALID_UPI_ID');
  }

  // ── Step 1: Fetch features from Redis (<5ms) ───────────────────────────
  const features = await getFeatures(userId);

  // ── Step 2: Check first-time payee (Redis SET lookup) ─────────────────
  const firstTime = await isFirstTimePayee(userId, tx.payeeUpi);
  const enrichedTx = { ...tx, isFirstTimePayee: firstTime, deviceId, ipAddress };

  // ── Step 3: Score (<1ms — pure sync function) ──────────────────────────
  const riskResult = calculateFraudRisk(enrichedTx, features);
  const riskSummary = getRiskSummary(riskResult);

  // ── Step 4: Generate AI explanation (parallel with DB write) ──────────
  // Only call Groq if risk is elevated — saves tokens + latency for safe txns
  let aiMessage = null;
  if (riskResult.decision !== 'ALLOW') {
    aiMessage = await generateGuardianMessage(enrichedTx, riskResult);
  }

  // ── Step 5: Persist transaction record (non-blocking) ─────────────────
  const txRecord = await Transaction.create({
    txId: generateTxId(),
    userId,
    amountPaise: tx.amountPaise,
    payeeUpi: tx.payeeUpi.toLowerCase(),
    payeeName: tx.payeeName || '',
    payerUpi: tx.payerUpi || `user@paytm`,
    category: tx.category || 'other',
    isFirstTimePayee: firstTime,
    status: riskResult.decision === 'BLOCK' ? 'BLOCKED' : 'PENDING',
    riskScore: riskResult.score,
    riskDecision: riskResult.decision,
    riskFlags: riskResult.flags,
    deviceId: deviceId || '',
    ipAddress: ipAddress || '',
    initiatedVia: tx.via || 'app',
    note: tx.note || '',
    isMock: tx.isMock || false,
  });

  // ── Step 6: Non-blocking background updates ────────────────────────────
  setImmediate(() => {
    incrementVelocity(userId).catch(console.error);
    if (riskResult.decision === 'ALLOW' || riskResult.decision === 'WARN') {
      // Only update profile on non-blocked transactions
      updateProfileOnTransaction(userId, { ...enrichedTx, txId: txRecord.txId }).catch(console.error);
    }
  });

  const totalLatency = endTimer();
  console.log(`⚡ [Guardian] userId=${userId} score=${riskResult.score} decision=${riskResult.decision} latency=${totalLatency.toFixed(1)}ms`);

  return {
    txId: txRecord.txId,
    riskScore: riskResult.score,
    decision: riskResult.decision,
    flags: riskResult.flags,
    shap: riskResult.shap,
    summary: riskSummary,
    message: aiMessage,
    isFirstTimePayee: firstTime,
    metadata: {
      ...riskResult.metadata,
      totalLatencyMs: Math.round(totalLatency),
      featureSource: features.fromRedis ? 'redis' : 'mongodb',
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// confirmTransaction — called when user proceeds despite warning
// Marks the transaction as SUCCESS and updates payee trust
// ─────────────────────────────────────────────────────────────────────────────
const confirmTransaction = async (txId, userId) => {
  const txRecord = await Transaction.findOneAndUpdate(
    { txId, userId, status: { $in: ['PENDING', 'BLOCKED'] } },
    { $set: { status: 'SUCCESS' } },
    { new: true }
  );

  if (!txRecord) throw AppError.notFound('Transaction');

  // Mark payee as known — won't be flagged as first-time again
  setImmediate(() => {
    addKnownPayee(userId, txRecord.payeeUpi).catch(console.error);
    updateFrequentPayee(userId, txRecord).catch(console.error);
    // Update profile if this was a first-time payee that succeeded
    if (txRecord.isFirstTimePayee) {
      updateProfileOnTransaction(userId, txRecord).catch(console.error);
    }
  });

  return { txId, status: 'SUCCESS', confirmedAt: new Date().toISOString() };
};

// ─────────────────────────────────────────────────────────────────────────────
// getSpendInsights — returns weekly analysis for Insights tab
// ─────────────────────────────────────────────────────────────────────────────
const getSpendInsights = async (userId, period = 'week') => {
  const { getWeeklySpendSummary, detectSpendAnomalies, generateWeeklyInsight } = require('./engines/spendAnalyzer');

  const [summary, anomalies, insight] = await Promise.all([
    getWeeklySpendSummary(userId),
    detectSpendAnomalies(userId),
    generateWeeklyInsight(userId),
  ]);

  return { summary, anomalies, insight, period };
};

module.exports = { scoreTransaction, confirmTransaction, getSpendInsights };