'use strict';

const mongoose = require('mongoose');
const { TX_CATEGORIES } = require('../../shared/constants');

// ─────────────────────────────────────────────────────────────────────────────
// Transaction schema — immutable financial record
// Amounts stored in paise (integer) — no floating point in fintech
// ─────────────────────────────────────────────────────────────────────────────
const TransactionSchema = new mongoose.Schema(
  {
    txId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },

    // ── PAYMENT DETAILS ────────────────────────────────────────────────────
    amountPaise: {
      type: Number,
      required: true,
      min: [100, 'Minimum transaction is ₹1 (100 paise)'],
    },
    currency: { type: String, default: 'INR', enum: ['INR'] },

    payeeUpi: {
      type: String,
      required: true,
      lowercase: true,
    },
    payeeName: { type: String, default: '' },
    payerUpi: { type: String, required: true, lowercase: true },

    // ── CLASSIFICATION ────────────────────────────────────────────────────
    category: {
      type: String,
      enum: TX_CATEGORIES,
      default: 'other',
    },
    isFirstTimePayee: { type: Boolean, default: false },
    isMock: { type: Boolean, default: false }, // flag for demo data

    // ── STATUS ────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['PENDING', 'SUCCESS', 'FAILED', 'BLOCKED'],
      default: 'PENDING',
    },

    // ── GUARDIAN RISK PAYLOAD ─────────────────────────────────────────────
    riskScore: { type: Number, min: 0, max: 100, default: null },
    riskDecision: {
      type: String,
      enum: ['ALLOW', 'WARN', 'BLOCK', null],
      default: null,
    },
    riskFlags: { type: [String], default: [] },

    // ── DEVICE / CONTEXT ─────────────────────────────────────────────────
    deviceId: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    initiatedVia: {
      type: String,
      enum: ['app', 'vani', 'mock'],
      default: 'app',
    },

    // ── NOTES ────────────────────────────────────────────────────────────
    note: { type: String, default: '', maxlength: 100 },
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
// Compound indexes for the common query patterns
// ─────────────────────────────────────────────────────────────────────────────
TransactionSchema.index({ userId: 1, createdAt: -1 }); // user history, newest first
TransactionSchema.index({ userId: 1, category: 1 });    // spend by category
TransactionSchema.index({ payeeUpi: 1 });               // payee lookup for trust check

// ─────────────────────────────────────────────────────────────────────────────
// Virtual — rupees (display only, never store)
// ─────────────────────────────────────────────────────────────────────────────
TransactionSchema.virtual('amountRupees').get(function () {
  return this.amountPaise / 100;
});

// ─────────────────────────────────────────────────────────────────────────────
// TTL index — auto-delete transactions older than 1 year
// ─────────────────────────────────────────────────────────────────────────────
TransactionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 3600 });

const Transaction = mongoose.model('Transaction', TransactionSchema);

module.exports = Transaction;