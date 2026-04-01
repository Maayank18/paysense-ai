'use strict';

const { transcribe, understand, execute, startSession } = require('./vani.service');
const { asyncHandler, successResponse } = require('../../middleware/errorHandler');

// POST /api/vani/session  — create new session
const createSession = asyncHandler(async (req, res) => {
  const session = await startSession(req.user.userId);
  return successResponse(res, { sessionId: session.sessionId }, 'Vani session started', 201);
});

// POST /api/vani/transcribe  — audio → text (Step 1)
const transcribeRoute = asyncHandler(async (req, res) => {
  const audioBuffer = req.file?.buffer || null;
  const mimeType = req.file?.mimetype || 'audio/webm';
  const textFallback = req.body?.text || null;

  const result = await transcribe({ audioBuffer, mimeType, textFallback });
  return successResponse(res, result, 'Transcription complete');
});

// POST /api/vani/understand  — text → intent + dialogue response (Step 2)
const understandRoute = asyncHandler(async (req, res) => {
  const { transcript, sessionId } = req.body;

  if (!transcript) {
    const { AppError } = require('../../middleware/errorHandler');
    throw AppError.badRequest('transcript is required', 'MISSING_TRANSCRIPT');
  }

  const result = await understand({
    transcript,
    sessionId: sessionId || null,
    userId: req.user.userId,
  });

  return successResponse(res, result, 'Intent understood');
});

// POST /api/vani/execute  — execute confirmed action (Step 3)
const executeRoute = asyncHandler(async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    const { AppError } = require('../../middleware/errorHandler');
    throw AppError.badRequest('sessionId is required', 'MISSING_SESSION_ID');
  }

  const result = await execute({ sessionId, userId: req.user.userId });
  return successResponse(res, result, 'Action executed');
});

// POST /api/vani/pipeline  — single-call pipeline (transcribe + understand)
// Convenience endpoint for frontend — reduces round trips
const pipeline = asyncHandler(async (req, res) => {
  const audioBuffer = req.file?.buffer || null;
  const mimeType = req.file?.mimetype || 'audio/webm';
  const textFallback = req.body?.text || null;
  const sessionId = req.body?.sessionId || null;

  // Step 1: Transcribe
  const sttResult = await transcribe({ audioBuffer, mimeType, textFallback });

  // Step 2: Understand
  const nluResult = await understand({
    transcript: sttResult.transcript,
    sessionId,
    userId: req.user.userId,
  });

  return successResponse(res, { stt: sttResult, nlu: nluResult }, 'Pipeline complete');
});

module.exports = { createSession, transcribeRoute, understandRoute, executeRoute, pipeline };