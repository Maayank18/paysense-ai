'use strict';

const { transcribe, understand, execute } = require('./vani.service');
const { generateVaniResponse } = require('../../shared/services/groqClient');
const { startTimer } = require('../../shared/utils/helpers');

// ─────────────────────────────────────────────────────────────────────────────
// initVaniSocket
// Manages real-time Vani voice sessions over Socket.IO.
// Enables streaming transcript + progressive UI updates.
//
// Events FROM client:
//   vani:start   — start a new voice session
//   vani:audio   — send audio chunk (base64)
//   vani:text    — send text fallback directly
//   vani:confirm — confirm the pending action
//   vani:cancel  — cancel current session
//
// Events TO client:
//   vani:transcript    — live transcript as audio is processed
//   vani:understanding — NLU result + next dialogue prompt
//   vani:confirm_ready — all slots filled, ready for confirmation
//   vani:result        — execution result with TTS text
//   vani:error         — non-fatal error
// ─────────────────────────────────────────────────────────────────────────────
const initVaniSocket = (io) => {
  const vani = io.of('/vani');

  vani.on('connection', (socket) => {
    console.log(`🎙️  [Vani Socket] Client connected: ${socket.id}`);

    socket.on('user:join', (userId) => {
      socket.join(`vani:${userId}`);
      socket.data.userId = userId;
      socket.data.sessionId = null;
      console.log(`   👤 [Vani Socket] ${userId} joined vani room`);
      socket.emit('vani:ready', { message: 'Vani is listening. Tap mic to start.' });
    });

    // ── VANI:START — initialize new dialogue session ──────────────────
    socket.on('vani:start', async () => {
      const userId = socket.data.userId;
      if (!userId) { socket.emit('vani:error', { message: 'Not authenticated' }); return; }

      try {
        const { startSession } = require('./vani.service');
        const session = await startSession(userId);
        socket.data.sessionId = session.sessionId;
        socket.emit('vani:session_started', { sessionId: session.sessionId });
      } catch (err) {
        socket.emit('vani:error', { message: 'Failed to start session', code: 'SESSION_ERROR' });
      }
    });

    // ── VANI:AUDIO — process audio buffer ────────────────────────────
    socket.on('vani:audio', async (payload) => {
      const endTimer = startTimer();
      const userId = socket.data.userId;
      const sessionId = socket.data.sessionId;

      if (!userId) { socket.emit('vani:error', { message: 'Not authenticated' }); return; }

      try {
        const { audioBase64, mimeType } = payload;
        const audioBuffer = audioBase64 ? Buffer.from(audioBase64, 'base64') : null;

        // Step 1: Transcribe
        const sttResult = await transcribe({ audioBuffer, mimeType: mimeType || 'audio/webm' });
        socket.emit('vani:transcript', {
          transcript: sttResult.transcript,
          confidence: sttResult.confidence,
          latencyMs: sttResult.latencyMs,
        });

        if (!sttResult.transcript) {
          socket.emit('vani:error', { message: 'Could not understand audio. Please try again.' });
          return;
        }

        // Step 2: Understand
        await _processTranscript(socket, sttResult.transcript, userId, sessionId);
        console.log(`⚡ [Vani Socket] Full pipeline: ${endTimer().toFixed(1)}ms`);
      } catch (err) {
        console.error('[Vani Socket] vani:audio error:', err.message);
        socket.emit('vani:error', {
          message: 'Voice processing failed. Please try typing instead.',
          code: 'VOICE_ERROR',
        });
      }
    });

    // ── VANI:TEXT — process text input (fallback/demo mode) ───────────
    socket.on('vani:text', async (payload) => {
      const userId = socket.data.userId;
      const sessionId = socket.data.sessionId;

      if (!userId) { socket.emit('vani:error', { message: 'Not authenticated' }); return; }

      try {
        const { text } = payload;
        const sttResult = { transcript: text, confidence: 0.95, latencyMs: 0, source: 'text' };
        socket.emit('vani:transcript', sttResult);
        await _processTranscript(socket, text, userId, sessionId);
      } catch (err) {
        console.error('[Vani Socket] vani:text error:', err.message);
        socket.emit('vani:error', { message: 'Processing failed', code: 'NLU_ERROR' });
      }
    });

    // ── VANI:CONFIRM — user said "haan"/confirmed the action ─────────
    socket.on('vani:confirm', async () => {
      const userId = socket.data.userId;
      const sessionId = socket.data.sessionId;

      if (!userId || !sessionId) {
        socket.emit('vani:error', { message: 'No active session to confirm' });
        return;
      }

      try {
        const result = await execute({ sessionId, userId });
        socket.emit('vani:result', result);
        socket.data.sessionId = null;
      } catch (err) {
        console.error('[Vani Socket] vani:confirm error:', err.message);
        socket.emit('vani:error', { message: err.message, code: 'EXECUTION_ERROR' });
      }
    });

    // ── VANI:CANCEL ───────────────────────────────────────────────────
    socket.on('vani:cancel', async () => {
      const sessionId = socket.data.sessionId;
      if (sessionId) {
        const { deleteSession } = require('./engines/dialogueManager');
        await deleteSession(sessionId).catch(console.error);
        socket.data.sessionId = null;
      }
      socket.emit('vani:cancelled', { message: 'Theek hai, cancel kar diya.' });
    });

    socket.on('disconnect', () => {
      console.log(`🎙️  [Vani Socket] ${socket.id} disconnected`);
    });
  });

  return vani;
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal: process a transcript through NLU + dialogue manager
// ─────────────────────────────────────────────────────────────────────────────
const _processTranscript = async (socket, transcript, userId, sessionId) => {
  const dialogueResult = await understand({ transcript, sessionId, userId });

  // Update session ID if a new one was created
  if (dialogueResult.session?.sessionId) {
    socket.data.sessionId = dialogueResult.session.sessionId;
  }

  socket.emit('vani:understanding', {
    intent: dialogueResult.nlu?.intent,
    action: dialogueResult.action,
    prompt: dialogueResult.prompt,
    confirmPayload: dialogueResult.confirmPayload || null,
    latencyMs: dialogueResult.totalLatencyMs,
  });

  if (dialogueResult.action === 'CONFIRM') {
    socket.emit('vani:confirm_ready', dialogueResult.confirmPayload);
  } else if (dialogueResult.action === 'RESPOND' || dialogueResult.action === 'EXECUTE') {
    const result = await execute({ sessionId: socket.data.sessionId, userId });
    socket.emit('vani:result', result);
    socket.data.sessionId = null;
  }
};

module.exports = { initVaniSocket };