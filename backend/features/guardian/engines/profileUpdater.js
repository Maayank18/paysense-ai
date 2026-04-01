'use strict';

const User = require('../../user/user.model');
const { setFeatures } = require('./featureExtractor');
const {
  updateRollingAverage,
  updateWelfordVariance,
} = require('../../../shared/utils/helpers');

// ─────────────────────────────────────────────────────────────────────────────
// updateProfileOnTransaction
// Called AFTER a transaction completes (async, non-blocking to payment flow).
// Updates: rolling avg, Welford variance, weekly spend, category totals.
// Uses MongoDB findOneAndUpdate with $set — atomic, safe.
// ─────────────────────────────────────────────────────────────────────────────
const updateProfileOnTransaction = async (userId, tx) => {
  try {
    const user = await User.findOne({ userId }, {
      financialBaseline: 1,
      fraudVelocity: 1,
    }).lean();

    if (!user) {
      console.warn(`[ProfileUpdater] User ${userId} not found — skipping update`);
      return;
    }

    const baseline = user.financialBaseline || {};

    // ── 1. Update rolling average and variance (Welford's algorithm) ──────
    const currentCount = baseline.txCountForBaseline || 0;
    const welfordState = {
      mean: baseline.avgTxAmountPaise || 50_000,
      M2: baseline.welfordM2 || 0,
      count: currentCount,
    };

    const updated = updateWelfordVariance(welfordState, tx.amountPaise);

    // ── 2. Update weekly spend ──────────────────────────────────────────────
    // Reset week if 7 days have passed since weekStartDate
    const weekStart = new Date(baseline.weekStartDate || Date.now());
    const isNewWeek = Date.now() - weekStart.getTime() > 7 * 24 * 3600 * 1000;

    const thisWeekSpend = isNewWeek ? tx.amountPaise
      : (baseline.thisWeekSpendPaise || 0) + tx.amountPaise;
    const lastWeekSpend = isNewWeek
      ? (baseline.thisWeekSpendPaise || 0)
      : (baseline.lastWeekSpendPaise || 0);

    // ── 3. Build update payload ────────────────────────────────────────────
    const $set = {
      'financialBaseline.avgTxAmountPaise': Math.round(updated.mean),
      'financialBaseline.stdDevAmountPaise': Math.round(updated.stdDev),
      'financialBaseline.welfordM2': updated.M2,
      'financialBaseline.txCountForBaseline': updated.count,
      'financialBaseline.thisWeekSpendPaise': thisWeekSpend,
      'financialBaseline.lastWeekSpendPaise': lastWeekSpend,
      'financialBaseline.totalTransactions30d': (baseline.totalTransactions30d || 0) + 1,
      'fraudVelocity.lastTxAt': new Date(),
      'lastActiveAt': new Date(),
    };

    if (isNewWeek) {
      $set['financialBaseline.weekStartDate'] = new Date();
    }

    // ── 4. Increment category total ────────────────────────────────────────
    const categoryKey = `financialBaseline.categoryTotals.${tx.category || 'other'}`;
    const $inc = {
      [categoryKey]: tx.amountPaise,
      'fraudVelocity.txLast1hr': 1,
      'fraudVelocity.txLast24hr': 1,
    };

    await User.findOneAndUpdate({ userId }, { $set, $inc }, { new: false });

    // ── 5. Backfill Redis feature store ────────────────────────────────────
    await setFeatures(userId, {
      avgTxAmountPaise: Math.round(updated.mean),
      stdDevAmountPaise: Math.round(updated.stdDev),
      txLast1hr: (user.fraudVelocity?.txLast1hr || 0) + 1,
      txLast24hr: (user.fraudVelocity?.txLast24hr || 0) + 1,
      failedAttempts24hr: user.fraudVelocity?.failedAttempts24hr || 0,
      lastKnownDeviceId: tx.deviceId || user.fraudVelocity?.lastKnownDeviceId || '',
      lastKnownIp: tx.ipAddress || user.fraudVelocity?.lastKnownIp || '',
    });
  } catch (err) {
    // Non-critical — don't throw. Log and continue.
    console.error('[ProfileUpdater] Error updating profile:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// updateFrequentPayee — adds/updates a payee after successful payment
// ─────────────────────────────────────────────────────────────────────────────
const updateFrequentPayee = async (userId, tx) => {
  try {
    const { payeeUpi, payeeName, amountPaise } = tx;

    // Upsert: if payee exists, update counts; otherwise push new
    const userDoc = await User.findOne({ userId }, { frequentPayees: 1 }).lean();
    const existingIdx = userDoc?.frequentPayees?.findIndex(
      (p) => p.upiId === payeeUpi.toLowerCase()
    ) ?? -1;

    if (existingIdx >= 0) {
      await User.findOneAndUpdate(
        { userId, 'frequentPayees.upiId': payeeUpi.toLowerCase() },
        {
          $inc: {
            'frequentPayees.$.txCount': 1,
            'frequentPayees.$.totalPaidPaise': amountPaise,
          },
          $set: { 'frequentPayees.$.lastPaidAt': new Date() },
        }
      );
    } else {
      await User.findOneAndUpdate(
        { userId },
        {
          $push: {
            frequentPayees: {
              upiId: payeeUpi.toLowerCase(),
              displayName: payeeName || '',
              alias: payeeName ? [payeeName.toLowerCase()] : [],
              trustScore: 60, // new payees start at neutral trust
              txCount: 1,
              lastPaidAt: new Date(),
              totalPaidPaise: amountPaise,
            },
          },
        }
      );
    }
  } catch (err) {
    console.error('[ProfileUpdater] Error updating frequent payee:', err.message);
  }
};

module.exports = { updateProfileOnTransaction, updateFrequentPayee };