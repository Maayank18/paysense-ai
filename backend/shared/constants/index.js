'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// GUARDIAN — Risk scoring thresholds and weights
// ─────────────────────────────────────────────────────────────────────────────
const GUARDIAN = Object.freeze({
  RISK_THRESHOLDS: {
    ALLOW: 40,   // score <= 40 → safe, no alert
    WARN: 75,    // 40 < score <= 75 → warn user
    BLOCK: 76,   // score > 75 → strong block recommendation
  },
  SCORE_WEIGHTS: {
    VELOCITY_1HR: 30,
    FIRST_TIME_PAYEE: 25,
    AMOUNT_ANOMALY_Z2: 35,
    TEMPORAL_LATE_NIGHT: 20,
    PHISHING_KEYWORD: 50,
    DEVICE_CHANGE: 25,
    HIGH_AMOUNT_ABSOLUTE: 15,
  },
  Z_SCORE_THRESHOLD: 2.0,
  LATE_NIGHT_HOURS: { start: 0, end: 5 },
  VELOCITY_1HR_THRESHOLD: 5,
  PHISHING_KEYWORDS: ['cashback', 'offer', 'kyc', 'refund', 'prize', 'reward', 'verify', 'update'],
  MAX_SCORE: 100,
});

// ─────────────────────────────────────────────────────────────────────────────
// SCOREUP — Credit proxy scoring weights
// Mirrors CIBIL factor distribution for credibility
// ─────────────────────────────────────────────────────────────────────────────
const SCOREUP = Object.freeze({
  WEIGHTS: {
    PAYMENT_HISTORY: 35,      // mirrors CIBIL's #1 factor
    CREDIT_UTILIZATION: 25,   // mirrors CIBIL's #2 factor
    ACCOUNT_AGE: 15,          // mirrors CIBIL's #3 factor
    BEHAVIORAL_DIVERSITY: 15, // Paytm-unique behavioral signal
    WALLET_HEALTH: 10,        // Paytm-unique signal (FastTag + wallet)
  },
  UTIL_BRACKETS: {
    EXCELLENT: { max: 0.30, score: 25 },
    GOOD: { max: 0.50, score: 18 },
    FAIR: { max: 0.80, score: 10 },
    POOR: { score: 2 },
  },
  LEVELS: {
    GOLD: 80,
    SILVER: 55,
    BRONZE: 0,
  },
  // Days of account age to earn each credit age point (3pts per 90 days)
  AGE_DAYS_PER_POINT: 90,
  AGE_POINTS_PER_PERIOD: 3,
});

// ─────────────────────────────────────────────────────────────────────────────
// VANI — Dialogue state machine states and intents
// ─────────────────────────────────────────────────────────────────────────────
const VANI = Object.freeze({
  STATES: {
    IDLE: 'IDLE',
    LISTENING: 'LISTENING',
    CLARIFY_PAYEE: 'CLARIFY_PAYEE',
    CLARIFY_AMOUNT: 'CLARIFY_AMOUNT',
    CONFIRMING: 'CONFIRMING',
    EXECUTING: 'EXECUTING',
    SUCCESS: 'SUCCESS',
    FAILURE: 'FAILURE',
  },
  INTENTS: {
    PAY_PERSON: 'PAY_PERSON',
    CHECK_BALANCE: 'CHECK_BALANCE',
    GET_SUMMARY: 'GET_SUMMARY',
    PAY_BILL: 'PAY_BILL',
    CHECK_SCOREUP: 'CHECK_SCOREUP',
    GET_FRAUD_ALERT: 'GET_FRAUD_ALERT',
    CANCEL: 'CANCEL',
    CONFIRM: 'CONFIRM',
    UNKNOWN: 'UNKNOWN',
  },
  SESSION_TTL_SECONDS: 300, // 5 min dialogue session
  WHISPER_MODEL: 'whisper-1',
  MAX_AUDIO_SIZE_MB: 25,
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION — Categories for spend intelligence
// ─────────────────────────────────────────────────────────────────────────────
const TX_CATEGORIES = Object.freeze([
  'food_delivery',
  'grocery',
  'utilities',
  'mobile_recharge',
  'transit',
  'entertainment',
  'shopping',
  'fuel',
  'health',
  'education',
  'p2p_transfer',
  'merchant_pos',
  'emi_payment',
  'insurance',
  'investment',
  'other',
]);

// ─────────────────────────────────────────────────────────────────────────────
// HTTP STATUS CODES — centralized to avoid magic numbers
// ─────────────────────────────────────────────────────────────────────────────
const HTTP = Object.freeze({
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
});

module.exports = { GUARDIAN, SCOREUP, VANI, TX_CATEGORIES, HTTP };