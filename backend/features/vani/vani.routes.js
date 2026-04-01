'use strict';

const { Router } = require('express');
const multer = require('multer');
const { createSession, transcribeRoute, understandRoute, executeRoute, pipeline } = require('./vani.controller');
const { demoAuth } = require('../../middleware/auth');
const { vaniLimiter } = require('../../middleware/rateLimit');

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Multer — in-memory storage for audio buffers (no disk writes)
// Max 25MB enforced (Whisper API limit)
// ─────────────────────────────────────────────────────────────────────────────
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/webm', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype}`), false);
    }
  },
});

// POST /api/vani/session — create dialogue session
router.post('/session', demoAuth, createSession);

// POST /api/vani/transcribe — audio buffer → transcript
// Accepts: multipart/form-data (audio file) OR JSON { text } for fallback
router.post('/transcribe', demoAuth, vaniLimiter, audioUpload.single('audio'), transcribeRoute);

// POST /api/vani/understand — transcript → intent + dialogue action
router.post('/understand', demoAuth, understandRoute);

// POST /api/vani/execute — execute confirmed session action
router.post('/execute', demoAuth, executeRoute);

// POST /api/vani/pipeline — combined transcribe + understand in one call
// Preferred endpoint for frontend — one round trip instead of two
router.post('/pipeline', demoAuth, vaniLimiter, audioUpload.single('audio'), pipeline);

module.exports = router;