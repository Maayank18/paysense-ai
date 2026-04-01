'use strict';

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');
const env = require('../../../config/env');
const { VANI } = require('../../../shared/constants');
const { startTimer } = require('../../../shared/utils/helpers');
const { AppError } = require('../../../middleware/errorHandler');

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI client for Whisper STT — separate from Groq client
// ─────────────────────────────────────────────────────────────────────────────
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// transcribeAudio
// Sends audio buffer to Whisper API with Hindi+English language hint.
// Returns cleaned transcript optimized for NLU downstream.
//
// Target latency: ~200ms (Whisper API for short utterances < 5s)
// ─────────────────────────────────────────────────────────────────────────────
const transcribeAudio = async (audioBuffer, mimeType = 'audio/webm') => {
  const endTimer = startTimer();

  if (!audioBuffer || audioBuffer.length === 0) {
    throw AppError.badRequest('Audio buffer is empty', 'EMPTY_AUDIO');
  }

  // Validate file size — Whisper limit is 25MB
  const maxBytes = VANI.MAX_AUDIO_SIZE_MB * 1024 * 1024;
  if (audioBuffer.length > maxBytes) {
    throw AppError.badRequest(
      `Audio file too large (max ${VANI.MAX_AUDIO_SIZE_MB}MB)`,
      'AUDIO_TOO_LARGE'
    );
  }

  // Whisper requires a File-like object — write buffer to temp file
  const ext = mimeType.includes('webm') ? '.webm'
    : mimeType.includes('wav') ? '.wav'
    : mimeType.includes('mp3') ? '.mp3'
    : '.webm';

  const tmpPath = path.join(os.tmpdir(), `vani_${Date.now()}${ext}`);

  try {
    fs.writeFileSync(tmpPath, audioBuffer);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpPath),
      model: VANI.WHISPER_MODEL,
      language: 'hi',        // Hint: Hindi — dramatically improves Hinglish accuracy
      response_format: 'verbose_json',  // Get confidence + segments
      temperature: 0.0,       // Deterministic transcription for financial commands
    });

    const latency = endTimer();
    const transcript = transcription.text?.trim() || '';

    console.log(`⚡ [STT] Whisper transcribed in ${latency.toFixed(0)}ms: "${transcript.slice(0, 60)}"`);

    return {
      transcript,
      language: transcription.language || 'hi',
      duration: transcription.duration || 0,
      confidence: estimateConfidence(transcription),
      latencyMs: Math.round(latency),
    };
  } catch (err) {
    if (err instanceof AppError) throw err;

    // Whisper API errors
    if (err.status === 400) {
      throw AppError.badRequest(
        'Audio format not supported. Use WebM or WAV.',
        'UNSUPPORTED_AUDIO_FORMAT'
      );
    }
    if (err.status === 429) {
      throw AppError.tooManyRequests('Speech transcription rate limit reached');
    }

    throw new Error(`Whisper STT failed: ${err.message}`);
  } finally {
    // Always clean up temp file
    try { fs.unlinkSync(tmpPath); } catch { /* ignore cleanup errors */ }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Fallback STT — for when Whisper is unavailable or too slow
// Uses Web Speech API fallback text passed directly from frontend
// (Frontend can send text directly if mic unavailable in noisy environments)
// ─────────────────────────────────────────────────────────────────────────────
const processTextFallback = (text) => {
  if (!text || typeof text !== 'string') {
    throw AppError.badRequest('Text input is empty', 'EMPTY_TEXT');
  }
  const cleaned = text.trim().slice(0, 500);
  return {
    transcript: cleaned,
    language: 'hinglish',
    duration: 0,
    confidence: 0.9,  // User typed it — higher confidence than voice
    latencyMs: 0,
    source: 'text_fallback',
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Estimate confidence from Whisper verbose response
// Whisper doesn't give per-utterance confidence directly,
// so we approximate from avg segment no_speech_prob
// ─────────────────────────────────────────────────────────────────────────────
const estimateConfidence = (transcription) => {
  const segments = transcription.segments || [];
  if (segments.length === 0) return 0.7; // default

  const avgNoSpeech = segments.reduce((sum, s) => sum + (s.no_speech_prob || 0), 0) / segments.length;
  return Math.round((1 - avgNoSpeech) * 100) / 100;
};

module.exports = { transcribeAudio, processTextFallback };