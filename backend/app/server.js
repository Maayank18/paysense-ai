'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// server.js — PaySense AI Backend Entry Point
//
// Startup sequence:
//   1. Validate environment variables (Zod — hard exit on failure)
//   2. Connect MongoDB
//   3. Connect Redis
//   4. Create Express app
//   5. Create HTTP server
//   6. Initialize Socket.IO with Guardian + Vani namespaces
//   7. Seed demo user
//   8. Start mock transaction stream (if ENABLE_MOCK_GENERATOR=true)
//   9. Start ScoreUp nightly cron
//  10. Start listening on PORT
//
// Shutdown sequence (SIGTERM / SIGINT):
//   1. Stop accepting new connections
//   2. Stop mock generator
//   3. Stop cron
//   4. Close Socket.IO
//   5. Close HTTP server
//   6. Disconnect MongoDB
//   7. Disconnect Redis
//   8. Exit 0
// ─────────────────────────────────────────────────────────────────────────────

// Step 1 — env validation runs on require (throws + exits if invalid)
const env = require('../config/env');

const http = require('http');
const { createApp } = require('./app');
const { connect: connectMongo, gracefulDisconnect: disconnectMongo } = require('../config/db');
const { connect: connectRedis, gracefulDisconnect: disconnectRedis } = require('../config/redis');
const { initSocketServer } = require('../socket');
const { seedDemoUser } = require('../features/user/user.service');
const { startMockStream } = require('../jobs/mockTxGenerator');
const { startCron } = require('../jobs/scoreupCron');

// ─────────────────────────────────────────────────────────────────────────────
// Boot sequence
// ─────────────────────────────────────────────────────────────────────────────
const boot = async () => {
  console.log('\n🚀  PaySense AI Backend starting…\n');

  // ── Step 2: MongoDB ──────────────────────────────────────────────────
  await connectMongo();

  // ── Step 3: Redis ────────────────────────────────────────────────────
  await connectRedis();

  // ── Step 4: Express app ───────────────────────────────────────────────
  const app = createApp();

  // ── Step 5: HTTP server ───────────────────────────────────────────────
  const httpServer = http.createServer(app);

  // ── Step 6: Socket.IO ─────────────────────────────────────────────────
  const { io, guardianNS } = initSocketServer(httpServer);

  // ── Step 7: Seed demo user ────────────────────────────────────────────
  try {
    await seedDemoUser();
  } catch (err) {
    console.warn('⚠️   [Boot] Demo user seed skipped:', err.message);
  }

  // ── Step 8: Mock transaction stream ───────────────────────────────────
  let mockIntervalId = null;
  if (env.ENABLE_MOCK_GENERATOR) {
    // Small delay so Socket.IO is fully ready before first emit
    setTimeout(() => {
      mockIntervalId = startMockStream(guardianNS, env.DEMO_USER_ID);
    }, 3_000);
  }

  // ── Step 9: Nightly ScoreUp cron ──────────────────────────────────────
  const cronJob = startCron();

  // ── Step 10: Listen ───────────────────────────────────────────────────
  await new Promise((resolve) => httpServer.listen(env.PORT, resolve));

  console.log(`\n✅  PaySense AI Backend running on port ${env.PORT}`);
  console.log(`   ENV:        ${env.NODE_ENV}`);
  console.log(`   MongoDB:    connected`);
  console.log(`   Redis:      connected`);
  console.log(`   Socket.IO:  /guardian, /vani`);
  console.log(`   Mock stream: ${env.ENABLE_MOCK_GENERATOR ? `✓ every ${env.MOCK_TX_INTERVAL_MS}ms` : '✗ disabled'}`);
  console.log(`   Demo user:  ${env.DEMO_USER_ID}`);
  console.log(`\n   Health:  http://localhost:${env.PORT}/health`);
  console.log(`   Demo JWT: POST http://localhost:${env.PORT}/api/user/demo-login\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // Graceful shutdown handler
  // ─────────────────────────────────────────────────────────────────────────
  const shutdown = async (signal) => {
    console.log(`\n⚡  [Shutdown] Received ${signal}. Shutting down gracefully…`);

    // Stop accepting new connections immediately
    httpServer.close(() => {
      console.log('   HTTP server closed.');
    });

    // Stop mock generator
    if (mockIntervalId) {
      clearInterval(mockIntervalId);
      console.log('   Mock generator stopped.');
    }

    // Stop cron
    cronJob.stop();
    console.log('   ScoreUp cron stopped.');

    // Close Socket.IO
    await new Promise((resolve) => io.close(resolve));
    console.log('   Socket.IO closed.');

    // Disconnect DB + Redis
    await disconnectMongo();
    await disconnectRedis();

    console.log('✅  [Shutdown] Clean exit.\n');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ── Unhandled rejection safety net ────────────────────────────────────
  process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥  [UNHANDLED REJECTION]', { reason, promise });
    // Don't exit in hackathon mode — log and continue
    if (env.NODE_ENV === 'production') {
      shutdown('unhandledRejection').then(() => process.exit(1));
    }
  });

  process.on('uncaughtException', (err) => {
    console.error('🔥  [UNCAUGHT EXCEPTION]', err);
    shutdown('uncaughtException').then(() => process.exit(1));
  });

  return { httpServer, io };
};

// ─────────────────────────────────────────────────────────────────────────────
// Execute
// ─────────────────────────────────────────────────────────────────────────────
boot().catch((err) => {
  console.error('❌  [Boot] Fatal startup error:', err);
  process.exit(1);
});