'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// mockTxGenerator.js
//
// Two roles:
//   1. SEED mode (node mockTxGenerator.js --seed):
//      Generates 30 days of historical transactions for the demo user.
//      Run once before the hackathon demo.
//
//   2. STREAM mode (started by server.js):
//      Fires a new realistic transaction every MOCK_TX_INTERVAL_MS seconds.
//      15% chance of a suspicious transaction — triggers Guardian demo.
//      Emits to Guardian socket namespace so live dashboard updates.
// ─────────────────────────────────────────────────────────────────────────────

const env = require('../config/env');
const Transaction = require('../features/transaction/transaction.model');
const { setFeatures } = require('../features/guardian/engines/featureExtractor');
const { generateTxId, rupeesToPaise } = require('../shared/utils/helpers');

// ── Realistic Indian merchant/payee data ────────────────────────────────────

const NORMAL_TRANSACTIONS = [
  { payeeUpi: 'swiggy@hdfc',           payeeName: 'Swiggy',           category: 'food_delivery',    amountRange: [199, 650] },
  { payeeUpi: 'zomato@paytm',          payeeName: 'Zomato',           category: 'food_delivery',    amountRange: [149, 800] },
  { payeeUpi: 'jio_prepaid@sbi',       payeeName: 'Jio Prepaid',      category: 'mobile_recharge',  amountRange: [199, 399] },
  { payeeUpi: 'bescomdel@paytm',       payeeName: 'BSES Electricity', category: 'utilities',         amountRange: [500, 1800] },
  { payeeUpi: 'indigo.airlines@icici', payeeName: 'IndiGo Airlines',  category: 'transit',           amountRange: [2500, 8000] },
  { payeeUpi: 'ramesh.kumar@paytm',    payeeName: 'Ramesh Kumar',     category: 'p2p_transfer',     amountRange: [200, 2000] },
  { payeeUpi: 'amazon.in@apl',         payeeName: 'Amazon India',     category: 'shopping',         amountRange: [299, 3500] },
  { payeeUpi: 'uber@axis',             payeeName: 'Uber',             category: 'transit',           amountRange: [80, 450] },
  { payeeUpi: 'reliance.smart@paytm',  payeeName: 'Reliance Smart',   category: 'grocery',          amountRange: [400, 2200] },
  { payeeUpi: 'netflix@hdfc',          payeeName: 'Netflix',          category: 'entertainment',    amountRange: [149, 649] },
  { payeeUpi: 'apollo.pharmacy@ybl',   payeeName: 'Apollo Pharmacy',  category: 'health',           amountRange: [200, 1500] },
  { payeeUpi: 'bigbasket@icici',       payeeName: 'BigBasket',        category: 'grocery',          amountRange: [500, 2500] },
  { payeeUpi: 'paytm.fuel@paytm',      payeeName: 'HP Petrol Pump',   category: 'fuel',             amountRange: [500, 2000] },
  { payeeUpi: 'hdfc.emi@hdfc',         payeeName: 'HDFC EMI',         category: 'emi_payment',      amountRange: [3000, 8000] },
  { payeeUpi: 'priya.sharma@okaxis',   payeeName: 'Priya Sharma',     category: 'p2p_transfer',     amountRange: [100, 1000] },
  { payeeUpi: 'byju.learning@rbl',     payeeName: "Byju's",           category: 'education',        amountRange: [500, 4000] },
];

// ── Suspicious transactions — will trigger Guardian ──────────────────────────
const SUSPICIOUS_TRANSACTIONS = [
  { payeeUpi: 'kyc_update_2026@ybl',     payeeName: '',         category: 'other',        amountRange: [5000, 25000], flags: ['phishing_keyword', 'first_time', 'high_amount'] },
  { payeeUpi: 'cashback_offer99@paytm',  payeeName: '',         category: 'other',        amountRange: [1000, 10000], flags: ['phishing_keyword', 'first_time'] },
  { payeeUpi: 'refund.desk@icici',       payeeName: 'Refund',   category: 'other',        amountRange: [2000, 15000], flags: ['phishing_keyword', 'first_time', 'high_amount'] },
  { payeeUpi: 'unknown.user9912@paytm',  payeeName: '',         category: 'p2p_transfer', amountRange: [8000, 50000], flags: ['first_time', 'very_high_amount'] },
  { payeeUpi: 'prize.winner@ybl',        payeeName: '',         category: 'other',        amountRange: [500, 5000],   flags: ['phishing_keyword', 'first_time'] },
];

// ── Amount generator ─────────────────────────────────────────────────────────
const randomAmount = ([min, max]) =>
  Math.round((Math.random() * (max - min) + min) / 10) * 10; // Round to nearest ₹10

const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ─────────────────────────────────────────────────────────────────────────────
// generateOneTx — builds a single realistic transaction object
// ─────────────────────────────────────────────────────────────────────────────
const generateOneTx = (userId, opts = {}) => {
  const isSuspicious = opts.forceSuspicious || Math.random() > 0.85; // 15% suspicious rate
  const template = isSuspicious
    ? randomElement(SUSPICIOUS_TRANSACTIONS)
    : randomElement(NORMAL_TRANSACTIONS);

  const amountRupees = randomAmount(template.amountRange);

  return {
    txId: generateTxId(),
    userId,
    amountPaise: rupeesToPaise(amountRupees),
    payeeUpi: template.payeeUpi,
    payeeName: template.payeeName,
    payerUpi: `${userId.replace('usr_', '')}@paytm`,
    category: template.category,
    isFirstTimePayee: isSuspicious,
    status: 'SUCCESS',
    riskScore: null,
    riskDecision: null,
    riskFlags: [],
    deviceId: 'dev_demo_iphone15',
    ipAddress: '103.119.24.50',
    initiatedVia: 'mock',
    isMock: true,
    createdAt: opts.createdAt || new Date(),
    updatedAt: opts.createdAt || new Date(),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// seedHistoricalTransactions
// Inserts 30 days of realistic data for the demo user.
// Called with: node src/jobs/mockTxGenerator.js --seed
// ─────────────────────────────────────────────────────────────────────────────
const seedHistoricalTransactions = async (userId, days = 30) => {
  const { connect } = require('../config/db');
  const { connect: connectRedis } = require('../config/redis');

  await connect();
  await connectRedis();

  console.log(`🌱 [Seed] Generating ${days} days of mock transactions for ${userId}…`);

  const txsToInsert = [];
  const msPerDay = 24 * 3600 * 1000;
  const now = Date.now();

  for (let d = days; d >= 1; d--) {
    // 1-5 transactions per day (realistic cadence)
    const txPerDay = Math.floor(Math.random() * 4) + 1;
    for (let t = 0; t < txPerDay; t++) {
      const hourOffset = Math.floor(Math.random() * 18) + 6; // 6am-midnight
      const createdAt = new Date(now - (d * msPerDay) + (hourOffset * 3600 * 1000));
      txsToInsert.push(generateOneTx(userId, { createdAt }));
    }
  }

  // Bulk insert — ignore duplicates from repeated seed runs
  try {
    const result = await Transaction.insertMany(txsToInsert, { ordered: false });
    console.log(`✅  [Seed] Inserted ${result.length} transactions.`);
  } catch (err) {
    if (err.code === 11000) {
      console.log(`⚠️   [Seed] Some transactions already existed — skipped duplicates.`);
    } else {
      throw err;
    }
  }

  // Prime Redis feature store for the demo user
  const totalAmountPaise = txsToInsert.reduce((s, t) => s + t.amountPaise, 0);
  const avgAmountPaise = Math.round(totalAmountPaise / txsToInsert.length);

  await setFeatures(userId, {
    avgTxAmountPaise: avgAmountPaise,
    stdDevAmountPaise: Math.round(avgAmountPaise * 0.4),
    txLast1hr: 0,
    txLast24hr: 2,
    failedAttempts24hr: 0,
    lastKnownDeviceId: 'dev_demo_iphone15',
    lastKnownIp: '103.119.24.50',
  });

  console.log(`✅  [Seed] Redis feature store primed. Avg tx: ₹${avgAmountPaise / 100}`);
  console.log('🎉  [Seed] Done! Demo user is ready.');
  process.exit(0);
};

// ─────────────────────────────────────────────────────────────────────────────
// startMockStream
// Called by server.js — starts the live transaction stream for the demo.
// Emits transactions to the Guardian socket namespace so the dashboard updates.
// ─────────────────────────────────────────────────────────────────────────────
const startMockStream = (guardianIO, userId) => {
  if (!env.ENABLE_MOCK_GENERATOR) {
    console.log('ℹ️   [MockGen] Stream disabled (ENABLE_MOCK_GENERATOR=false)');
    return null;
  }

  console.log(
    `🔄  [MockGen] Live stream started — interval: ${env.MOCK_TX_INTERVAL_MS}ms | userId: ${userId}`
  );

  let txCount = 0;

  const intervalId = setInterval(async () => {
    try {
      // Every 7th transaction is suspicious — creates reliable Guardian demo moments
      const forceSuspicious = txCount > 0 && txCount % 7 === 0;
      const tx = generateOneTx(userId, { forceSuspicious });

      // Save to DB
      await Transaction.create(tx);
      txCount++;

      // Emit to the live stream room for dashboard consumption
      if (guardianIO) {
        guardianIO.to('tx:stream').emit('tx:stream', {
          txId: tx.txId,
          amountRupees: tx.amountPaise / 100,
          payeeUpi: tx.payeeUpi,
          payeeName: tx.payeeName,
          category: tx.category,
          isFirstTimePayee: tx.isFirstTimePayee,
          timestamp: new Date().toISOString(),
          isMock: true,
          // Pre-flag suspicious ones so frontend can show warning without waiting for score
          isSuspicious: tx.isFirstTimePayee,
        });
      }

      if (env.NODE_ENV === 'development') {
        const flag = tx.isFirstTimePayee ? '🚨' : '✅';
        console.log(
          `${flag} [MockGen] #${txCount} ₹${tx.amountPaise / 100} → ${tx.payeeUpi}`
        );
      }
    } catch (err) {
      console.error('[MockGen] Error generating transaction:', err.message);
    }
  }, env.MOCK_TX_INTERVAL_MS);

  return intervalId;
};

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point — run with: node src/jobs/mockTxGenerator.js --seed
// ─────────────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const isSeedMode = process.argv.includes('--seed');
  if (isSeedMode) {
    const userId = process.argv[process.argv.indexOf('--user') + 1] || env.DEMO_USER_ID;
    seedHistoricalTransactions(userId).catch((err) => {
      console.error('❌  [Seed] Fatal error:', err);
      process.exit(1);
    });
  } else {
    console.log('Usage: node src/jobs/mockTxGenerator.js --seed [--user <userId>]');
    process.exit(0);
  }
}

module.exports = { startMockStream, generateOneTx, seedHistoricalTransactions };