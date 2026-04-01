'use strict';

const cron = require('node-cron');
const User = require('../features/user/user.model');
const { recomputeScore } = require('../features/scoreup/scoreup.service');
const env = require('../config/env');

// ─────────────────────────────────────────────────────────────────────────────
// ScoreUp Nightly Cron
// Runs at 2:00 AM every day — recomputes proxy credit scores for all users.
// Stores results in MongoDB and primes Redis cache so morning app-opens
// are served from cache (<5ms) rather than computed on-demand.
//
// Strategy: Process users in batches of 10 to avoid overwhelming Groq API
// (coaching message generation requires one Groq call per user).
// ─────────────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 2_000; // 2s between batches — respects Groq rate limits

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const runScoreUpCron = async () => {
  const startTime = Date.now();
  console.log('⏰  [ScoreUp Cron] Starting nightly score recompute…');

  try {
    // Fetch all active user IDs — lean projection for minimal memory
    const users = await User.find({ isActive: true }, { userId: 1 }).lean();
    const total = users.length;

    if (total === 0) {
      console.log('ℹ️   [ScoreUp Cron] No active users found.');
      return;
    }

    console.log(`   Processing ${total} users in batches of ${BATCH_SIZE}…`);

    let processed = 0;
    let failed = 0;

    // Process in batches — Promise.allSettled won't stop on individual failures
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map((u) => recomputeScore(u.userId))
      );

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          processed++;
          if (env.NODE_ENV === 'development') {
            console.log(
              `   ✓ ${batch[idx].userId} → score: ${result.value.score} (${result.value.level})`
            );
          }
        } else {
          failed++;
          console.error(
            `   ✗ ${batch[idx].userId} failed: ${result.reason?.message}`
          );
        }
      });

      // Pause between batches to avoid rate-limiting Groq
      if (i + BATCH_SIZE < users.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `✅  [ScoreUp Cron] Complete — ${processed}/${total} processed, ` +
      `${failed} failed, duration: ${duration}s`
    );
  } catch (err) {
    console.error('❌  [ScoreUp Cron] Fatal error:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// startCron — registers the scheduled job
// Called once from server.js
// Schedule: "0 2 * * *" = 2:00 AM every day, India timezone
// ─────────────────────────────────────────────────────────────────────────────
const startCron = () => {
  const job = cron.schedule('0 2 * * *', runScoreUpCron, {
    scheduled: true,
    timezone: 'Asia/Kolkata',
  });

  console.log('⏰  [ScoreUp Cron] Scheduled — runs daily at 2:00 AM IST');

  return job;
};

// ─────────────────────────────────────────────────────────────────────────────
// CLI: run immediately for testing
// node src/jobs/scoreupCron.js --run
// ─────────────────────────────────────────────────────────────────────────────
if (require.main === module && process.argv.includes('--run')) {
  const { connect } = require('../config/db');
  const { connect: connectRedis } = require('../config/redis');

  (async () => {
    await connect();
    await connectRedis();
    await runScoreUpCron();
    process.exit(0);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { startCron, runScoreUpCron };