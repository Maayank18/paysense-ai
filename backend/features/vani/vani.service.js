'use strict';

const { transcribeAudio, processTextFallback } = require('./engines/sttService');
const { understandTranscript } = require('./engines/nluService');
const { processDialogueTurn, createSession, deleteSession } = require('./engines/dialogueManager');
const { generateVaniResponse } = require('../../shared/services/groqClient');
const User = require('../user/user.model');
const Transaction = require('../transaction/transaction.model');
const { AppError } = require('../../middleware/errorHandler');
const { generateTxId, startTimer, paiseToRupees } = require('../../shared/utils/helpers');
const { VANI } = require('../../shared/constants');

// ─────────────────────────────────────────────────────────────────────────────
// transcribe — Step 1 of Vani pipeline
// Converts audio buffer → transcript text
// ─────────────────────────────────────────────────────────────────────────────
const transcribe = async ({ audioBuffer, mimeType, textFallback }) => {
  // Text fallback path (demo mode / noisy environment)
  if (textFallback) {
    return processTextFallback(textFallback);
  }

  if (!audioBuffer) {
    throw AppError.badRequest('Either audioBuffer or textFallback is required', 'MISSING_INPUT');
  }

  return transcribeAudio(audioBuffer, mimeType);
};

// ─────────────────────────────────────────────────────────────────────────────
// understand — Step 2: NLU + dialogue state machine
// Returns next dialogue action + updated session
// ─────────────────────────────────────────────────────────────────────────────
const understand = async ({ transcript, sessionId, userId }) => {
  const endTimer = startTimer();

  // Load user profile for payee resolution
  const userProfile = await User.findByUserId(userId);
  if (!userProfile) throw AppError.notFound('User');

  // NLU
  const nluResult = await understandTranscript(transcript);

  // Dialogue state machine
  const dialogueResult = await processDialogueTurn(nluResult, sessionId, userProfile);

  const latency = endTimer();

  return {
    ...dialogueResult,
    nlu: {
      intent: nluResult.intent,
      confidence: nluResult.confidence,
      source: nluResult.source,
    },
    totalLatencyMs: Math.round(latency),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// execute — Step 3: Execute the confirmed action
// Called after user confirms in CONFIRMING state
// ─────────────────────────────────────────────────────────────────────────────
const execute = async ({ sessionId, userId }) => {
  const { loadSession } = require('./engines/dialogueManager');

  const session = await loadSession(sessionId);
  if (!session) throw AppError.badRequest('Session expired or not found', 'SESSION_EXPIRED');
  if (session.state !== VANI.STATES.EXECUTING && session.state !== VANI.STATES.CONFIRMING) {
    throw AppError.badRequest('Nothing to execute in current session state', 'INVALID_STATE');
  }

  const { slots, intent } = session;
  let result = {};

  switch (intent) {
    case VANI.INTENTS.PAY_PERSON: {
      if (!slots.upiId || !slots.amountPaise) {
        throw AppError.badRequest('Missing payment slots — upiId and amountPaise required', 'INCOMPLETE_SLOTS');
      }

      const txRecord = await Transaction.create({
        txId: generateTxId(),
        userId,
        amountPaise: slots.amountPaise,
        payeeUpi: slots.upiId.toLowerCase(),
        payeeName: slots.payee || '',
        payerUpi: `${userId}@paytm`,
        category: 'p2p_transfer',
        status: 'SUCCESS',
        riskScore: null,
        riskDecision: 'ALLOW',
        initiatedVia: 'vani',
      });

      const ttsText = await generateVaniResponse('PAYMENT_SUCCESS', {
        payee: slots.payee || slots.upiId,
        amount: paiseToRupees(slots.amountPaise),
      });

      result = {
        success: true,
        txId: txRecord.txId,
        amountRupees: paiseToRupees(slots.amountPaise),
        payee: slots.payee || slots.upiId,
        ttsText,
      };
      break;
    }

    case VANI.INTENTS.CHECK_BALANCE: {
      // Mock balance for demo — in production, fetch from banking API
      const balance = 12_450;
      const ttsText = await generateVaniResponse('BALANCE_RESULT', { balance });
      result = { success: true, balance, ttsText };
      break;
    }

    case VANI.INTENTS.GET_SUMMARY: {
      const { getWeeklySpendSummary } = require('../guardian/engines/spendAnalyzer');
      const summary = await getWeeklySpendSummary(userId);
      const ttsText = await generateVaniResponse('SUMMARY_RESULT', {
        total: summary.thisWeekTotal,
        topCategory: summary.topCategory,
        changePercent: summary.changePercent,
      });
      result = { success: true, summary, ttsText };
      break;
    }

    case VANI.INTENTS.CHECK_SCOREUP: {
      const { getScoreForUser } = require('../scoreup/scoreup.service');
      const scoreData = await getScoreForUser(userId);
      const ttsText = await generateVaniResponse('SCORE_RESULT', {
        score: scoreData.score,
        level: scoreData.level,
      });
      result = { success: true, scoreData, ttsText };
      break;
    }

    default:
      throw AppError.badRequest(`Cannot execute intent: ${intent}`, 'UNSUPPORTED_INTENT');
  }

  // Clean up session after successful execution
  await deleteSession(sessionId);

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// startSession — creates a new Vani dialogue session
// ─────────────────────────────────────────────────────────────────────────────
const startSession = async (userId) => {
  const { saveSession } = require('./engines/dialogueManager');
  const session = createSession(userId);
  await saveSession(session);
  return session;
};

module.exports = { transcribe, understand, execute, startSession };