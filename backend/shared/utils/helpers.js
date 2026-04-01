'use strict';

const { v4: uuidv4 } = require('uuid');

// ─────────────────────────────────────────────────────────────────────────────
// ID generation — prefixed UUIDs for readability in logs
// ─────────────────────────────────────────────────────────────────────────────
const generateId = (prefix = 'id') => `${prefix}_${uuidv4().replace(/-/g, '').slice(0, 16)}`;

const generateTxId = () => generateId('tx');
const generateSessionId = () => generateId('sess');
const generateUserId = () => generateId('usr');

// ─────────────────────────────────────────────────────────────────────────────
// Currency — INR is always stored as paise (integer) to avoid float errors.
// Display uses rupee strings with ₹ symbol.
// ─────────────────────────────────────────────────────────────────────────────
/** Convert rupees (float) to paise (integer) */
const rupeesToPaise = (rupees) => Math.round(Number(rupees) * 100);

/** Convert paise (integer) to rupees (float, 2 decimal) */
const paiseToRupees = (paise) => Number((paise / 100).toFixed(2));

/** Format rupees for display: 150000 paise → "₹1,500.00" */
const formatINR = (paise) => {
  const rupees = paiseToRupees(paise);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(rupees);
};

// ─────────────────────────────────────────────────────────────────────────────
// UPI ID validation — basic format check
// Format: localpart@provider (e.g., user123@paytm, 9876543210@ybl)
// ─────────────────────────────────────────────────────────────────────────────
const UPI_REGEX = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/;
const isValidUpiId = (upiId) => UPI_REGEX.test(upiId);

// ─────────────────────────────────────────────────────────────────────────────
// Rolling average updater — O(1), no history needed
// newAvg = (oldAvg * count + newValue) / (count + 1)
// ─────────────────────────────────────────────────────────────────────────────
const updateRollingAverage = (currentAvg, currentCount, newValue) => {
  if (currentCount === 0) return newValue;
  return (currentAvg * currentCount + newValue) / (currentCount + 1);
};

// ─────────────────────────────────────────────────────────────────────────────
// Rolling standard deviation — Welford's online algorithm (O(1))
// Returns updated { mean, variance, count }
// ─────────────────────────────────────────────────────────────────────────────
const updateWelfordVariance = (state, newValue) => {
  const count = (state.count || 0) + 1;
  const delta = newValue - (state.mean || 0);
  const mean = (state.mean || 0) + delta / count;
  const delta2 = newValue - mean;
  const M2 = (state.M2 || 0) + delta * delta2;
  const variance = count > 1 ? M2 / (count - 1) : 0;
  return { mean, M2, variance, stdDev: Math.sqrt(variance), count };
};

// ─────────────────────────────────────────────────────────────────────────────
// Z-score calculation
// ─────────────────────────────────────────────────────────────────────────────
const calculateZScore = (value, mean, stdDev) => {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
};

// ─────────────────────────────────────────────────────────────────────────────
// Time utilities
// ─────────────────────────────────────────────────────────────────────────────
const now = () => new Date().toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const getCurrentHour = () => new Date().getHours();
const isLateNight = () => {
  const h = getCurrentHour();
  return h >= 0 && h <= 5;
};

// ─────────────────────────────────────────────────────────────────────────────
// Latency measurement — high-resolution timer
// Usage: const end = startTimer(); … const ms = end();
// ─────────────────────────────────────────────────────────────────────────────
const startTimer = () => {
  const t = process.hrtime.bigint();
  return () => Number(process.hrtime.bigint() - t) / 1_000_000; // → ms
};

// ─────────────────────────────────────────────────────────────────────────────
// Safe JSON parse — returns fallback instead of throwing
// ─────────────────────────────────────────────────────────────────────────────
const safeJsonParse = (str, fallback = null) => {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Clamp a number between min and max
// ─────────────────────────────────────────────────────────────────────────────
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

module.exports = {
  generateId, generateTxId, generateSessionId, generateUserId,
  rupeesToPaise, paiseToRupees, formatINR,
  isValidUpiId,
  updateRollingAverage, updateWelfordVariance, calculateZScore,
  now, daysAgo, getCurrentHour, isLateNight,
  startTimer,
  safeJsonParse,
  clamp,
};