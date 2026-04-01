'use strict';

const { calculateFraudRisk, getRiskSummary } = require('./engines/fraudScorer');
const { getFeatures, isFirstTimePayee, incrementVelocity } = require('./engines/featureExtractor');
const { generateGuardianMessage } = require('../../shared/services/groqClient');
const { updateProfileOnTransaction } = require('./engines/profileUpdater');
const Transaction = require('../transaction/transaction.model');
const { generateTxId, startTimer, isValidUpiId } = require('../../shared/utils/helpers');
const env = require('../../config/env');

// ─────────────────────────────────────────────────────────────────────────────
// initGuardianSocket
// Registers all Guardian-related Socket.IO event handlers on the server.
// Called once from socket/index.js.
//
// Socket events emitted TO client:
//   guardian:alert   — risk score + AI message for WARN/BLOCK decisions
//   guardian:safe    — confirmation for ALLOW decisions (green UX)
//   guardian:error   — non-fatal error notification
//   tx:stream        — live transaction feed for demo dashboard
// ─────────────────────────────────────────────────────────────────────────────
const initGuardianSocket = (io) => {
  // Namespace for Guardian events — isolates from Vani/ScoreUp
  const guardian = io.of('/guardian');

  guardian.on('connection', (socket) => {
    console.log(`🔌 [Guardian Socket] Client connected: ${socket.id}`);

    // ── USER:JOIN — client registers their personal room ─────────────────
    socket.on('user:join', (userId) => {
      if (!userId || typeof userId !== 'string') {
        socket.emit('guardian:error', { message: 'userId is required to join' });
        return;
      }
      socket.join(`user:${userId}`);
      socket.data.userId = userId;
      console.log(`   👤 [Guardian Socket] ${userId} joined room user:${userId}`);

      // Send confirmation so frontend knows socket is ready
      socket.emit('guardian:ready', {
        userId,
        message: 'Guardian is active. All transactions will be monitored.',
      });
    });

    // ── TX:INITIATE — main fraud scoring event ───────────────────────────
    // Fired by frontend when user enters payment amount + payee
    // Must complete + emit guardian:alert BEFORE user reaches PIN screen
    socket.on('tx:initiate', async (payload) => {
      const endTimer = startTimer();
      const userId = socket.data.userId || payload.userId;

      if (!userId) {
        socket.emit('guardian:error', { message: 'Not authenticated. Call user:join first.' });
        return;
      }

      try {
        const { amountPaise, payeeUpi, payeeName, category, note, deviceId, via } = payload;

        // Basic validation — fast fail before any I/O
        if (!amountPaise || !payeeUpi) {
          socket.emit('guardian:error', { message: 'amountPaise and payeeUpi are required.' });
          return;
        }

        if (!isValidUpiId(payeeUpi)) {
          socket.emit('guardian:error', {
            message: `Invalid UPI ID format: ${payeeUpi}`,
            code: 'INVALID_UPI_ID',
          });
          return;
        }

        // ── Step 1: Feature fetch (<5ms) ──────────────────────────────
        const [features, firstTime] = await Promise.all([
          getFeatures(userId),
          isFirstTimePayee(userId, payeeUpi),
        ]);

        const enrichedTx = {
          amountPaise: Number(amountPaise),
          payeeUpi: payeeUpi.toLowerCase(),
          payeeName: payeeName || '',
          category: category || 'other',
          note: note || '',
          isFirstTimePayee: firstTime,
          deviceId: deviceId || socket.handshake.headers['x-device-id'] || '',
          ipAddress: socket.handshake.address,
          via: via || 'app',
          isMock: payload.isMock || false,
        };

        // ── Step 2: Score (<1ms) ──────────────────────────────────────
        const riskResult = calculateFraudRisk(enrichedTx, features);
        const summary = getRiskSummary(riskResult);

        // ── Step 3: If elevated risk → generate AI message (parallel) ──
        let aiMessage = null;
        let txRecord = null;

        const [msgResult, savedTx] = await Promise.all([
          riskResult.decision !== 'ALLOW'
            ? generateGuardianMessage(enrichedTx, riskResult)
            : Promise.resolve(null),
          Transaction.create({
            txId: generateTxId(),
            userId,
            amountPaise: enrichedTx.amountPaise,
            payeeUpi: enrichedTx.payeeUpi,
            payeeName: enrichedTx.payeeName,
            payerUpi: `${userId}@paytm`,
            category: enrichedTx.category,
            isFirstTimePayee: firstTime,
            status: riskResult.decision === 'BLOCK' ? 'BLOCKED' : 'PENDING',
            riskScore: riskResult.score,
            riskDecision: riskResult.decision,
            riskFlags: riskResult.flags,
            deviceId: enrichedTx.deviceId,
            ipAddress: enrichedTx.ipAddress,
            initiatedVia: enrichedTx.via,
            note: enrichedTx.note,
            isMock: enrichedTx.isMock,
          }),
        ]);

        aiMessage = msgResult;
        txRecord = savedTx;

        const totalLatency = endTimer();

        // ── Step 4: Emit to user's room ───────────────────────────────
        const responsePayload = {
          txId: txRecord.txId,
          decision: riskResult.decision,
          score: riskResult.score,
          flags: riskResult.flags,
          shap: riskResult.shap,
          summary,
          message: aiMessage,
          isFirstTimePayee: firstTime,
          amountPaise: enrichedTx.amountPaise,
          payeeUpi: enrichedTx.payeeUpi,
          latencyMs: Math.round(totalLatency),
          timestamp: new Date().toISOString(),
        };

        if (riskResult.decision === 'ALLOW') {
          guardian.to(`user:${userId}`).emit('guardian:safe', responsePayload);
        } else {
          guardian.to(`user:${userId}`).emit('guardian:alert', responsePayload);
        }

        console.log(
          `⚡ [Guardian Socket] userId=${userId} score=${riskResult.score} ` +
          `decision=${riskResult.decision} latency=${totalLatency.toFixed(1)}ms`
        );

        // ── Step 5: Background profile update (non-blocking) ──────────
        setImmediate(() => {
          incrementVelocity(userId).catch(console.error);
          if (riskResult.decision !== 'BLOCK') {
            updateProfileOnTransaction(userId, { ...enrichedTx, txId: txRecord.txId })
              .catch(console.error);
          }
        });

        // ── Emit to transaction stream room (demo dashboard) ──────────
        guardian.to('tx:stream').emit('tx:stream', {
          txId: txRecord.txId,
          amountRupees: enrichedTx.amountPaise / 100,
          payeeUpi: enrichedTx.payeeUpi,
          category: enrichedTx.category,
          decision: riskResult.decision,
          score: riskResult.score,
          timestamp: new Date().toISOString(),
          isMock: enrichedTx.isMock,
        });
      } catch (err) {
        console.error('[Guardian Socket] tx:initiate error:', err.message);
        socket.emit('guardian:error', {
          message: 'Risk assessment temporarily unavailable. Transaction can proceed.',
          code: 'SCORING_ERROR',
        });
      }
    });

    // ── STREAM:JOIN — join the live transaction stream room (demo) ───────
    socket.on('stream:join', () => {
      socket.join('tx:stream');
      console.log(`   📊 [Guardian Socket] ${socket.id} joined tx:stream room`);
    });

    // ── DISCONNECT ────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`🔌 [Guardian Socket] ${socket.id} disconnected: ${reason}`);
    });
  });

  return guardian;
};

module.exports = { initGuardianSocket };