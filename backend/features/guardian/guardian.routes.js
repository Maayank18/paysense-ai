'use strict';

const { Router } = require('express');
const { score, confirm, insights } = require('./guardian.controller');
const { demoAuth } = require('../../middleware/auth');
const { guardianLimiter } = require('../../middleware/rateLimit');
const { z } = require('zod');
const { AppError, asyncHandler } = require('../../middleware/errorHandler');

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Request body validators (Zod schemas)
// ─────────────────────────────────────────────────────────────────────────────
const ScoreBodySchema = z.object({
  amountPaise: z
    .number({ required_error: 'amountPaise is required' })
    .int('Amount must be an integer (paise)')
    .min(100, 'Minimum transaction is ₹1 (100 paise)')
    .max(10_000_000_00, 'Maximum transaction is ₹1,00,00,000'),
  payeeUpi: z
    .string({ required_error: 'payeeUpi is required' })
    .regex(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/, 'Invalid UPI ID format'),
  payeeName: z.string().max(100).optional(),
  category: z.string().optional(),
  note: z.string().max(100).optional(),
  via: z.enum(['app', 'vani', 'mock']).optional(),
});

// Inline validation middleware factory
const validate = (schema) =>
  asyncHandler(async (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      throw AppError.badRequest('Validation failed', 'VALIDATION_ERROR', { errors });
    }
    req.body = result.data; // coerced and cleaned data
    next();
  });

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/guardian/score
 * Score a transaction before payment. Core Guardian endpoint.
 * Rate limited to NPCI OC-215 TPS caps.
 */
router.post('/score', demoAuth, guardianLimiter, validate(ScoreBodySchema), score);

/**
 * POST /api/guardian/confirm/:txId
 * User confirmed a warned/blocked transaction — mark as SUCCESS.
 */
router.post('/confirm/:txId', demoAuth, confirm);

/**
 * GET /api/guardian/insights
 * Weekly spend summary, anomaly detection, AI nudge.
 * Query: ?period=week|month
 */
router.get('/insights', demoAuth, insights);

module.exports = router;