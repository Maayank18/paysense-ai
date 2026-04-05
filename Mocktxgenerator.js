'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// mockTxGenerator.js
//
// KEY FIX: Suspicious transactions now go through scoreTransaction() instead of
// Transaction.create() directly. This means:
//   • riskDecision, riskScore, fraudTypeId are stored correctly
//   • guardian:alert fires via socket → GuardianModal appears automatically
//   • Analytics dashboard reflects real fraud type breakdown
//   • Every suspicious mock is production-equivalent, not a shortcut
//
// Two modes:
//   SEED (--seed flag): inserts 30 days of historical data including pre-scored fraud
//   STREAM (server.js): fires one transaction every MOCK_TX_INTERVAL_MS
// ─────────────────────────────────────────────────────────────────────────────

const env = require('../config/env');
const Transaction  = require('../features/transaction/transaction.model');
const { setFeatures } = require('../features/guardian/engines/featureExtractor');
const { generateTxId, rupeesToPaise } = require('../shared/utils/helpers');

// ── Normal (safe) transactions ────────────────────────────────────────────────
const NORMAL_TRANSACTIONS = [
  { payeeUpi:'swiggy@hdfc',          payeeName:'Swiggy',          category:'food_delivery',    amountRange:[199, 650]  },
  { payeeUpi:'zomato@paytm',         payeeName:'Zomato',          category:'food_delivery',    amountRange:[149, 800]  },
  { payeeUpi:'jio_prepaid@sbi',      payeeName:'Jio Prepaid',     category:'mobile_recharge',  amountRange:[199, 399]  },
  { payeeUpi:'bescomdel@paytm',      payeeName:'BSES Electricity',category:'utilities',         amountRange:[500, 1800] },
  { payeeUpi:'indigo.airlines@icici',payeeName:'IndiGo',          category:'transit',           amountRange:[2500,8000] },
  { payeeUpi:'ramesh.kumar@paytm',   payeeName:'Ramesh Kumar',    category:'p2p_transfer',     amountRange:[200, 2000] },
  { payeeUpi:'amazon.in@apl',        payeeName:'Amazon India',    category:'shopping',         amountRange:[299, 3500] },
  { payeeUpi:'uber@axis',            payeeName:'Uber',            category:'transit',           amountRange:[80,  450]  },
  { payeeUpi:'reliance.smart@paytm', payeeName:'Reliance Smart',  category:'grocery',          amountRange:[400, 2200] },
  { payeeUpi:'netflix@hdfc',         payeeName:'Netflix',         category:'entertainment',    amountRange:[149, 649]  },
  { payeeUpi:'apollo.pharmacy@ybl',  payeeName:'Apollo Pharmacy', category:'health',           amountRange:[200, 1500] },
  { payeeUpi:'bigbasket@icici',      payeeName:'BigBasket',       category:'grocery',          amountRange:[500, 2500] },
  { payeeUpi:'paytm.fuel@paytm',     payeeName:'HP Petrol Pump',  category:'fuel',             amountRange:[500, 2000] },
  { payeeUpi:'hdfc.emi@hdfc',        payeeName:'HDFC EMI',        category:'emi_payment',      amountRange:[3000,8000] },
  { payeeUpi:'priya.sharma@okaxis',  payeeName:'Priya Sharma',    category:'p2p_transfer',     amountRange:[100, 1000] },
];

// ── Suspicious transactions mapped to fraudClassifier types ──────────────────
// Each carries the exact UPI ID / amount pattern that triggers the right rules.
// The rule engine in fraudScorer.js will assign the correct fraudTypeId.
const SUSPICIOUS_TRANSACTIONS = [
  // PHISHING_ATTEMPT — keyword "kyc" or "refund" in UPI + first time
  { payeeUpi:'kyc_update_paytm2026@ybl',   payeeName:'',            category:'other',        amountRange:[5000,  25000], isFirstTimePayee:true  },
  { payeeUpi:'refund.desk.hdfc@icici',     payeeName:'Refund Desk', category:'other',        amountRange:[2000,  15000], isFirstTimePayee:true  },
  // SOCIAL_ENGINEERING — prize/cashback keyword + first time
  { payeeUpi:'cashback_offer99@paytm',     payeeName:'',            category:'other',        amountRange:[1000,  10000], isFirstTimePayee:true  },
  { payeeUpi:'prize.winner.claim@ybl',     payeeName:'Prize Center',category:'other',        amountRange:[500,   5000],  isFirstTimePayee:true  },
  // AMOUNT_ANOMALY — very high amount (will trigger Z-score > 2)
  { payeeUpi:'ramesh.kumar@paytm',         payeeName:'Ramesh Kumar',category:'p2p_transfer', amountRange:[70000, 95000], isFirstTimePayee:false },
  { payeeUpi:'priya.sharma@okaxis',        payeeName:'Priya Sharma',category:'p2p_transfer', amountRange:[60000, 80000], isFirstTimePayee:false },
  // TEMPORAL_ANOMALY — any unknown payee (forceLateNight set at score time)
  { payeeUpi:'unknown.user9912@paytm',     payeeName:'',            category:'p2p_transfer', amountRange:[8000,  50000], isFirstTimePayee:true  },
  // VELOCITY_FRAUD — small rapid amounts to unknown
  { payeeUpi:'unknown.acc77@paytm',        payeeName:'',            category:'p2p_transfer', amountRange:[100,   500],   isFirstTimePayee:true  },
];

const randomAmount = ([min, max]) =>
  Math.round((Math.random() * (max - min) + min) / 10) * 10;

const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ─────────────────────────────────────────────────────────────────────────────
// scoreSuspiciousTransaction
// Runs a suspicious mock transaction through the REAL Guardian pipeline so it:
//   1. Gets riskDecision/riskScore/fraudTypeId stored in MongoDB
//   2. Emits guardian:alert via Socket.IO (GuardianModal fires on frontend)
//   3. Invalidates analytics cache
// ─────────────────────────────────────────────────────────────────────────────
const scoreSuspiciousTransaction = async (userId, template, guardianIO) => {
  try {
    // Lazy-require to avoid circular dependency at module load time
    const { scoreTransaction } = require('../features/guardian/guardian.service');

    const tx = {
      amountPaise:      rupeesToPaise(randomAmount(template.amountRange)),
      payeeUpi:         template.payeeUpi,
      payeeName:        template.payeeName || '',
      category:         template.category,
      isFirstTimePayee: template.isFirstTimePayee,
      via:              'mock',
      isMock:           true,
      note:             '',
    };

    const result = await scoreTransaction({ userId, tx, deviceId:'dev_mock_stream', ipAddress:'127.0.0.1' });

    // Emit alert to frontend if socket is available and decision is elevated
    if (guardianIO && result.decision !== 'ALLOW') {
      guardianIO.to(`user:${userId}`).emit('guardian:alert', {
        txId:               result.txId,
        decision:           result.decision,
        score:              result.riskScore,
        flags:              result.flags,
        shap:               result.shap,
        fraudType:          result.fraudType,
        moneyAtRiskMessage: result.moneyAtRiskMessage,
        summary:            result.summary,
        message:            result.message,
        isFirstTimePayee:   template.isFirstTimePayee,
        amountPaise:        tx.amountPaise,
        payeeUpi:           tx.payeeUpi,
        latencyMs:          result.metadata?.totalLatencyMs ?? 0,
        timestamp:          new Date().toISOString(),
      });
    }

    // Emit to tx stream for dashboard feed
    if (guardianIO) {
      guardianIO.to('tx:stream').emit('tx:stream', {
        txId:        result.txId,
        amountRupees: tx.amountPaise / 100,
        payeeUpi:    tx.payeeUpi,
        payeeName:   tx.payeeName,
        category:    tx.category,
        decision:    result.decision,
        score:       result.riskScore,
        fraudType:   result.fraudType?.id ?? null,
        isMock:      true,
        timestamp:   new Date().toISOString(),
      });
    }

    return result;
  } catch (err) {
    console.error('[MockGen] Score failed, falling back to direct create:', err.message);
    // Graceful fallback: create raw transaction if service fails
    await Transaction.create({
      txId:         generateTxId(),
      userId,
      amountPaise:  rupeesToPaise(randomAmount(template.amountRange)),
      payeeUpi:     template.payeeUpi,
      payeeName:    template.payeeName || '',
      payerUpi:     `${userId}@paytm`,
      category:     template.category,
      isFirstTimePayee: template.isFirstTimePayee,
      status:       'PENDING',
      riskDecision: null,
      initiatedVia: 'mock',
      isMock:       true,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// startMockStream — live stream mode (called by server.js)
// Every MOCK_TX_INTERVAL_MS: fires one transaction.
// Every 7th transaction is suspicious and goes through full Guardian pipeline.
// ─────────────────────────────────────────────────────────────────────────────
const startMockStream = (guardianIO, userId) => {
  if (!env.ENABLE_MOCK_GENERATOR) {
    console.log('ℹ️   [MockGen] Stream disabled (ENABLE_MOCK_GENERATOR=false)');
    return null;
  }

  console.log(`🔄  [MockGen] Live stream started — ${env.MOCK_TX_INTERVAL_MS}ms interval | userId: ${userId}`);

  let txCount = 0;

  const intervalId = setInterval(async () => {
    try {
      txCount++;
      const isSuspicious = txCount % 7 === 0;

      if (isSuspicious) {
        // Run through full Guardian pipeline → stores riskDecision + fires socket alert
        const template = randomElement(SUSPICIOUS_TRANSACTIONS);
        await scoreSuspiciousTransaction(userId, template, guardianIO);
        console.log(`🚨 [MockGen] #${txCount} SUSPICIOUS → Guardian pipeline`);
      } else {
        // Safe transaction — direct create, no fraud pipeline needed
        const template   = randomElement(NORMAL_TRANSACTIONS);
        const amountPaise = rupeesToPaise(randomAmount(template.amountRange));
        const txRecord   = await Transaction.create({
          txId:        generateTxId(),
          userId,
          amountPaise,
          payeeUpi:    template.payeeUpi,
          payeeName:   template.payeeName,
          payerUpi:    `${userId}@paytm`,
          category:    template.category,
          isFirstTimePayee: false,
          status:      'SUCCESS',
          riskDecision:'ALLOW',
          riskScore:   Math.floor(Math.random() * 30),  // low score for safe txns
          initiatedVia:'mock',
          isMock:      true,
        });

        if (guardianIO) {
          guardianIO.to('tx:stream').emit('tx:stream', {
            txId:        txRecord.txId,
            amountRupees: amountPaise / 100,
            payeeUpi:    template.payeeUpi,
            payeeName:   template.payeeName,
            category:    template.category,
            decision:    'ALLOW',
            score:       txRecord.riskScore,
            fraudType:   null,
            isMock:      true,
            timestamp:   new Date().toISOString(),
          });
        }

        if (env.NODE_ENV === 'development') {
          console.log(`✅ [MockGen] #${txCount} ₹${amountPaise/100} → ${template.payeeUpi}`);
        }
      }
    } catch (err) {
      console.error('[MockGen] Stream error:', err.message);
    }
  }, env.MOCK_TX_INTERVAL_MS);

  return intervalId;
};

// ─────────────────────────────────────────────────────────────────────────────
// seedHistoricalTransactions — historical seed (--seed flag)
// Creates 30 days of realistic transactions INCLUDING pre-scored fraud
// so the analytics dashboard is populated immediately on first demo load.
// ─────────────────────────────────────────────────────────────────────────────
const seedHistoricalTransactions = async (userId, days = 30) => {
  const { connect }           = require('../config/db');
  const { connect: connectRedis } = require('../config/redis');

  await connect();
  await connectRedis();

  console.log(`🌱 [Seed] Generating ${days} days of mock transactions for ${userId}…`);

  const msPerDay   = 24 * 3600 * 1000;
  const now        = Date.now();
  const safeTxs    = [];

  // ── 1. Safe historical transactions (bulk) ────────────────────────────────
  for (let d = days; d >= 1; d--) {
    const txPerDay = Math.floor(Math.random() * 4) + 1;
    for (let t = 0; t < txPerDay; t++) {
      const hourOffset = Math.floor(Math.random() * 18) + 6;
      const createdAt  = new Date(now - d * msPerDay + hourOffset * 3600 * 1000);
      const template   = randomElement(NORMAL_TRANSACTIONS);
      const amountPaise = rupeesToPaise(randomAmount(template.amountRange));

      safeTxs.push({
        txId:        generateTxId(),
        userId,
        amountPaise,
        payeeUpi:    template.payeeUpi,
        payeeName:   template.payeeName,
        payerUpi:    `${userId}@paytm`,
        category:    template.category,
        isFirstTimePayee: false,
        status:      'SUCCESS',
        riskDecision:'ALLOW',
        riskScore:   Math.floor(Math.random() * 25),
        initiatedVia:'mock',
        isMock:      true,
        createdAt,
        updatedAt:   createdAt,
      });
    }
  }

  try {
    const result = await Transaction.insertMany(safeTxs, { ordered: false });
    console.log(`✅  [Seed] Inserted ${result.length} safe transactions.`);
  } catch (err) {
    if (err.code === 11000) console.log(`⚠️   [Seed] Some safe txns skipped (duplicate).`);
    else throw err;
  }

  // ── 2. Pre-scored fraud transactions (one per type) ───────────────────────
  // These are created directly with riskDecision set so analytics shows
  // a populated breakdown chart on first demo load without needing to wait.
  const FRAUD_SEED_DATA = [
    { fraudTypeId:'PHISHING_ATTEMPT',   riskDecision:'BLOCK', riskScore:92, amountPaise:2500000, payeeUpi:'kyc_update_seed@ybl',         daysAgo:6 },
    { fraudTypeId:'PHISHING_ATTEMPT',   riskDecision:'BLOCK', riskScore:88, amountPaise:1500000, payeeUpi:'refund.seed.hdfc@icici',      daysAgo:5 },
    { fraudTypeId:'SOCIAL_ENGINEERING', riskDecision:'BLOCK', riskScore:82, amountPaise:1000000, payeeUpi:'prize.seed.claim@ybl',        daysAgo:4 },
    { fraudTypeId:'SOCIAL_ENGINEERING', riskDecision:'WARN',  riskScore:65, amountPaise:500000,  payeeUpi:'cashback.seed99@paytm',       daysAgo:3 },
    { fraudTypeId:'AMOUNT_ANOMALY',     riskDecision:'BLOCK', riskScore:78, amountPaise:7500000, payeeUpi:'ramesh.kumar@paytm',          daysAgo:4 },
    { fraudTypeId:'AMOUNT_ANOMALY',     riskDecision:'WARN',  riskScore:62, amountPaise:6000000, payeeUpi:'priya.sharma@okaxis',         daysAgo:2 },
    { fraudTypeId:'ACCOUNT_TAKEOVER',   riskDecision:'WARN',  riskScore:71, amountPaise:5000000, payeeUpi:'swiggy@hdfc',                 daysAgo:3 },
    { fraudTypeId:'VELOCITY_FRAUD',     riskDecision:'BLOCK', riskScore:85, amountPaise:50000,   payeeUpi:'unknown.acc77@paytm',         daysAgo:1 },
    { fraudTypeId:'VELOCITY_FRAUD',     riskDecision:'WARN',  riskScore:68, amountPaise:30000,   payeeUpi:'unknown.acc88@paytm',         daysAgo:1 },
    { fraudTypeId:'TEMPORAL_ANOMALY',   riskDecision:'WARN',  riskScore:58, amountPaise:800000,  payeeUpi:'unknown.night.user@paytm',    daysAgo:2 },
  ];

  const fraudTxs = FRAUD_SEED_DATA.map((f) => {
    const createdAt = new Date(now - f.daysAgo * msPerDay + 2 * 3600 * 1000);
    return {
      txId:        generateTxId(),
      userId,
      amountPaise: f.amountPaise,
      payeeUpi:    f.payeeUpi,
      payeeName:   '',
      payerUpi:    `${userId}@paytm`,
      category:    'other',
      isFirstTimePayee: true,
      status:      f.riskDecision === 'BLOCK' ? 'BLOCKED' : 'PENDING',
      riskDecision: f.riskDecision,
      riskScore:   f.riskScore,
      riskFlags:   [`Seeded fraud example — type: ${f.fraudTypeId}`],
      riskShap:    [{ feature: 'seed', contribution: f.riskScore }],
      fraudTypeId: f.fraudTypeId,
      initiatedVia:'mock',
      isMock:      true,
      createdAt,
      updatedAt:   createdAt,
    };
  });

  try {
    const result = await Transaction.insertMany(fraudTxs, { ordered: false });
    console.log(`✅  [Seed] Inserted ${result.length} pre-scored fraud transactions.`);
  } catch (err) {
    if (err.code === 11000) console.log(`⚠️   [Seed] Some fraud txns skipped (duplicate).`);
    else throw err;
  }

  // ── 3. Prime Redis feature store ──────────────────────────────────────────
  const totalPaise = safeTxs.reduce((s, t) => s + t.amountPaise, 0);
  const avgPaise   = Math.round(totalPaise / safeTxs.length);

  await setFeatures(userId, {
    avgTxAmountPaise:  avgPaise,
    stdDevAmountPaise: Math.round(avgPaise * 0.4),
    txLast1hr:         0,
    txLast24hr:        2,
    failedAttempts24hr:0,
    lastKnownDeviceId: 'dev_demo_iphone15',
    lastKnownIp:       '103.119.24.50',
  });

  console.log(`✅  [Seed] Redis feature store primed. Avg tx: ₹${avgPaise/100}`);
  console.log('🎉  [Seed] Done! Dashboard will show fraud analytics immediately.');
  process.exit(0);
};

// ── CLI entry point ───────────────────────────────────────────────────────────
if (require.main === module) {
  if (process.argv.includes('--seed')) {
    const userId = process.argv[process.argv.indexOf('--user') + 1] || env.DEMO_USER_ID;
    seedHistoricalTransactions(userId).catch((err) => {
      console.error('❌  [Seed]', err);
      process.exit(1);
    });
  } else {
    console.log('Usage: node src/jobs/mockTxGenerator.js --seed [--user <userId>]');
    process.exit(0);
  }
}

module.exports = { startMockStream, seedHistoricalTransactions };