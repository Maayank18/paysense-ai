'use strict';

const mongoose = require('mongoose');
const env = require('./env');

// ─────────────────────────────────────────────────────────────────────────────
// Mongoose global config
// bufferCommands=false → throws immediately if not connected (no silent queue)
// ─────────────────────────────────────────────────────────────────────────────
mongoose.set('strictQuery', true);

const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 5_000,  // fail fast if Atlas is unreachable
  socketTimeoutMS: 45_000,
  maxPoolSize: 10,                  // enough for hackathon load
  minPoolSize: 2,
  heartbeatFrequencyMS: 10_000,
};

// ─────────────────────────────────────────────────────────────────────────────
// Connection function — called once at startup
// Retries 3 times before giving up to handle transient network hiccups
// ─────────────────────────────────────────────────────────────────────────────
const connect = async (retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(env.MONGODB_URI, MONGO_OPTIONS);
      console.log(
        `✅  [MongoDB] Connected — ${mongoose.connection.host}/${mongoose.connection.name}`
      );
      return;
    } catch (err) {
      console.error(
        `⚠️   [MongoDB] Attempt ${attempt}/${retries} failed: ${err.message}`
      );
      if (attempt < retries) {
        const delay = attempt * 2_000;
        console.log(`    Retrying in ${delay / 1000}s…`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        console.error('❌  [MongoDB] All connection attempts failed. Exiting.');
        process.exit(1);
      }
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle event listeners for observability
// ─────────────────────────────────────────────────────────────────────────────
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️   [MongoDB] Disconnected — attempting to reconnect…');
});

mongoose.connection.on('reconnected', () => {
  console.log('🔄  [MongoDB] Reconnected successfully.');
});

mongoose.connection.on('error', (err) => {
  console.error('❌  [MongoDB] Connection error:', err.message);
});

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown — close connection before process exits
// ─────────────────────────────────────────────────────────────────────────────
const gracefulDisconnect = async () => {
  try {
    await mongoose.connection.close();
    console.log('👋  [MongoDB] Connection closed gracefully.');
  } catch (err) {
    console.error('[MongoDB] Error during disconnect:', err.message);
  }
};

module.exports = { connect, gracefulDisconnect };