'use strict';

const mongoose = require('mongoose');
const { TX_CATEGORIES } = require('../../shared/constants');

// ─────────────────────────────────────────────────────────────────────────────
// Sub-schemas — kept lean for fast document reads
// ─────────────────────────────────────────────────────────────────────────────

const FrequentPayeeSchema = new mongoose.Schema(
  {
    upiId: { type: String, required: true },
    alias: { type: [String], default: [] },     // e.g., ["ramesh", "ramesh bhai"]
    displayName: { type: String, default: '' },
    trustScore: { type: Number, min: 0, max: 100, default: 50 },
    txCount: { type: Number, default: 0 },
    lastPaidAt: { type: Date },
    totalPaidPaise: { type: Number, default: 0 }, // stored as paise (integer)
  },
  { _id: false }
);

const FraudVelocitySchema = new mongoose.Schema(
  {
    txLast1hr: { type: Number, default: 0 },
    txLast24hr: { type: Number, default: 0 },
    failedAttempts24hr: { type: Number, default: 0 },
    lastKnownDeviceId: { type: String, default: '' },
    lastKnownIp: { type: String, default: '' },
    lastKnownLocation: {
      lat: { type: Number, default: 28.7041 },
      lng: { type: Number, default: 77.1025 },
      city: { type: String, default: 'Delhi' },
    },
    lastTxAt: { type: Date },
    velocityUpdatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const FinancialBaselineSchema = new mongoose.Schema(
  {
    // Rolling average of transaction amounts (in paise)
    avgTxAmountPaise: { type: Number, default: 50000 },  // ₹500 default
    stdDevAmountPaise: { type: Number, default: 20000 },  // ₹200 default
    welfordM2: { type: Number, default: 0 },              // For online variance
    txCountForBaseline: { type: Number, default: 0 },

    // Weekly spend tracking
    avgWeeklySpendPaise: { type: Number, default: 500000 }, // ₹5,000 default
    thisWeekSpendPaise: { type: Number, default: 0 },
    lastWeekSpendPaise: { type: Number, default: 0 },
    weekStartDate: { type: Date, default: Date.now },

    // Category breakdown
    categoryTotals: {
      type: Map,
      of: Number,  // category → paise total
      default: {},
    },

    // Monthly transaction count (for diversity scoring)
    uniqueCategoriesThisMonth: { type: Number, default: 0 },
    totalTransactions30d: { type: Number, default: 0 },
  },
  { _id: false }
);

const CreditSignalsSchema = new mongoose.Schema(
  {
    proxyScore: { type: Number, min: 0, max: 100, default: 50 },
    scoreLevel: { type: String, enum: ['BRONZE', 'SILVER', 'GOLD'], default: 'BRONZE' },

    // Postpaid data
    postpaidLimitPaise: { type: Number, default: 500000 },   // ₹5,000
    postpaidUtilizedPaise: { type: Number, default: 0 },
    postpaidDueDate: { type: Date },
    nextEmiAmountPaise: { type: Number, default: 0 },

    // Payment behavior
    onTimePaymentStreak: { type: Number, default: 0 },
    missedPaymentsLifetime: { type: Number, default: 0 },
    lastPaymentDate: { type: Date },
    lastPaymentWasOnTime: { type: Boolean, default: true },

    // Alternative signals
    utilityBillRegularity: { type: Number, min: 0, max: 1, default: 0.8 },
    walletMaintenanceScore: { type: Number, min: 0, max: 1, default: 0.7 },
    fastTagRegularity: { type: Number, min: 0, max: 1, default: 0.5 },
    inboundOutboundRatio: { type: Number, default: 0.6 },

    // Account metadata
    accountAgeDays: { type: Number, default: 0 },
    thinFile: { type: Boolean, default: true },

    // Gamification
    totalPoints: { type: Number, default: 0 },
    weeklyPoints: { type: Number, default: 0 },

    // Scoring history (last 4 weeks)
    scoreHistory: {
      type: [{ score: Number, date: Date }],
      default: [],
    },

    lastComputedAt: { type: Date },
  },
  { _id: false }
);

// ─────────────────────────────────────────────────────────────────────────────
// Main User Schema
// ─────────────────────────────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      match: [/^\+91[6-9]\d{9}$/, 'Invalid Indian phone number format (+91XXXXXXXXXX)'],
    },
    name: { type: String, required: true, trim: true },
    upiId: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: [/^[a-zA-Z0-9._-]+@[a-zA-Z]{2,}$/, 'Invalid UPI ID format'],
    },
    avatarUrl: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    onboardingDate: { type: Date, default: Date.now },

    // ── SHARED CONTEXT ────────────────────────────────────────────────────────
    financialBaseline: { type: FinancialBaselineSchema, default: () => ({}) },
    fraudVelocity: { type: FraudVelocitySchema, default: () => ({}) },
    creditSignals: { type: CreditSignalsSchema, default: () => ({}) },
    frequentPayees: { type: [FrequentPayeeSchema], default: [] },

    // ── VANI SESSION ──────────────────────────────────────────────────────────
    preferredLanguage: {
      type: String,
      enum: ['hi', 'en', 'hinglish'],
      default: 'hinglish',
    },

    // ── METADATA ─────────────────────────────────────────────────────────────
    lastActiveAt: { type: Date, default: Date.now },
    appVersion: { type: String, default: '1.0.0' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Indexes — optimized for the three query patterns we use most
// ─────────────────────────────────────────────────────────────────────────────
UserSchema.index({ phone: 1 });
UserSchema.index({ upiId: 1 });
UserSchema.index({ 'creditSignals.proxyScore': -1 }); // for leaderboard/analytics

// ─────────────────────────────────────────────────────────────────────────────
// Virtual — credit utilization ratio (computed, not stored)
// ─────────────────────────────────────────────────────────────────────────────
UserSchema.virtual('utilizationRatio').get(function () {
  const { postpaidLimitPaise, postpaidUtilizedPaise } = this.creditSignals;
  if (!postpaidLimitPaise) return 0;
  return postpaidUtilizedPaise / postpaidLimitPaise;
});

// ─────────────────────────────────────────────────────────────────────────────
// Static — find by userId with lean() for performance
// ─────────────────────────────────────────────────────────────────────────────
UserSchema.statics.findByUserId = function (userId) {
  return this.findOne({ userId }).lean();
};

const User = mongoose.model('User', UserSchema);

module.exports = User;