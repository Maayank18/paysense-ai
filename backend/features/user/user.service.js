'use strict';

const User = require('./user.model');
const { generateToken } = require('../../middleware/auth');
const { AppError } = require('../../middleware/errorHandler');
const { generateUserId, now } = require('../../shared/utils/helpers');
const env = require('../../config/env');

// ─────────────────────────────────────────────────────────────────────────────
// seedDemoUser — creates the demo user if it doesn't exist
// Called at startup so the demo always has data
// ─────────────────────────────────────────────────────────────────────────────
const seedDemoUser = async () => {
  const exists = await User.findOne({ userId: env.DEMO_USER_ID }).lean();
  if (exists) return exists;

  const demoUser = await User.create({
    userId: env.DEMO_USER_ID,
    phone: '+919876543210',
    name: 'Mayank Garg',
    upiId: 'mayank.garg@paytm',
    onboardingDate: new Date(Date.now() - 180 * 24 * 3600 * 1000), // 6 months ago

    financialBaseline: {
      avgTxAmountPaise: 45_000,       // ₹450 avg
      stdDevAmountPaise: 18_000,      // ₹180 std dev
      welfordM2: 291_600_000_000,
      txCountForBaseline: 90,
      avgWeeklySpendPaise: 420_000,   // ₹4,200/week
      thisWeekSpendPaise: 380_000,
      lastWeekSpendPaise: 350_000,
      weekStartDate: new Date(),
      uniqueCategoriesThisMonth: 7,
      totalTransactions30d: 38,
    },

    fraudVelocity: {
      txLast1hr: 0,
      txLast24hr: 2,
      failedAttempts24hr: 0,
      lastKnownDeviceId: 'dev_demo_iphone15',
      lastKnownIp: '103.119.24.50',
      lastKnownLocation: { lat: 28.7041, lng: 77.1025, city: 'Delhi' },
    },

    creditSignals: {
      proxyScore: 68,
      scoreLevel: 'SILVER',
      postpaidLimitPaise: 500_000,    // ₹5,000
      postpaidUtilizedPaise: 320_000, // ₹3,200 (64% utilization)
      postpaidDueDate: new Date(Date.now() + 3 * 24 * 3600 * 1000), // due in 3 days
      nextEmiAmountPaise: 320_000,
      onTimePaymentStreak: 4,
      missedPaymentsLifetime: 0,
      lastPaymentWasOnTime: true,
      utilityBillRegularity: 0.85,
      walletMaintenanceScore: 0.72,
      fastTagRegularity: 0.6,
      inboundOutboundRatio: 0.55,
      accountAgeDays: 180,
      thinFile: false,
      totalPoints: 240,
      weeklyPoints: 35,
    },

    frequentPayees: [
      { upiId: 'swiggy@hdfc', alias: ['swiggy', 'खाना', 'khana'], displayName: 'Swiggy', trustScore: 100, txCount: 22, totalPaidPaise: 1_320_000 },
      { upiId: 'ramesh.kumar@paytm', alias: ['ramesh', 'ramesh bhai', 'ramesh bhaiya'], displayName: 'Ramesh Kumar', trustScore: 98, txCount: 8, totalPaidPaise: 240_000 },
      { upiId: 'zomato@paytm', alias: ['zomato'], displayName: 'Zomato', trustScore: 100, txCount: 15, totalPaidPaise: 920_000 },
      { upiId: 'jio_prepaid@sbi', alias: ['jio', 'mobile recharge'], displayName: 'Jio Prepaid', trustScore: 100, txCount: 6, totalPaidPaise: 119_400 },
      { upiId: 'bescomdel@paytm', alias: ['bijli', 'electricity', 'light bill'], displayName: 'BSES Electricity', trustScore: 100, txCount: 5, totalPaidPaise: 350_000 },
    ],
  });

  console.log(`🌱 [Seed] Demo user created: ${demoUser.userId}`);
  return demoUser;
};

// ─────────────────────────────────────────────────────────────────────────────
// getProfile — fetch user profile for API response
// ─────────────────────────────────────────────────────────────────────────────
const getProfile = async (userId) => {
  const user = await User.findByUserId(userId);
  if (!user) throw AppError.notFound('User');

  return {
    userId: user.userId,
    name: user.name,
    phone: user.phone,
    upiId: user.upiId,
    avatarUrl: user.avatarUrl,
    onboardingDate: user.onboardingDate,
    preferredLanguage: user.preferredLanguage,
    frequentPayees: user.frequentPayees,
    lastActiveAt: user.lastActiveAt,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// getDemoToken — returns a JWT for the demo user (dev only)
// ─────────────────────────────────────────────────────────────────────────────
const getDemoToken = async () => {
  const user = await seedDemoUser();
  const token = generateToken(user.userId, user.phone);
  return { token, userId: user.userId, name: user.name };
};

module.exports = { seedDemoUser, getProfile, getDemoToken };