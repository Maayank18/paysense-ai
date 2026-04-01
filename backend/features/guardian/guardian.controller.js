'use strict';

const { scoreTransaction, confirmTransaction, getSpendInsights } = require('./guardian.service');
const { asyncHandler, successResponse } = require('../../middleware/errorHandler');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/guardian/score
// Body: { amountPaise, payeeUpi, payeeName?, category?, note? }
// Returns risk score + AI explanation + SHAP codes
// ─────────────────────────────────────────────────────────────────────────────
const score = asyncHandler(async (req, res) => {
  const { amountPaise, payeeUpi, payeeName, category, note, via } = req.body;
  const userId = req.user.userId;

  const result = await scoreTransaction({
    userId,
    tx: { amountPaise: Number(amountPaise), payeeUpi, payeeName, category, note, via },
    deviceId: req.headers['x-device-id'] || '',
    ipAddress: req.ip,
  });

  const statusCode = result.decision === 'ALLOW' ? 200 : result.decision === 'WARN' ? 200 : 200;
  return successResponse(res, result, `Guardian: ${result.decision}`, statusCode);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/guardian/confirm/:txId
// Confirms a transaction the user chose to proceed with despite warning
// ─────────────────────────────────────────────────────────────────────────────
const confirm = asyncHandler(async (req, res) => {
  const { txId } = req.params;
  const userId = req.user.userId;

  const result = await confirmTransaction(txId, userId);
  return successResponse(res, result, 'Transaction confirmed');
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/guardian/insights
// Query: ?period=week (default) | month
// Returns weekly spend summary + anomalies + AI nudge
// ─────────────────────────────────────────────────────────────────────────────
const insights = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { period = 'week' } = req.query;

  const result = await getSpendInsights(userId, period);
  return successResponse(res, result, 'Spend insights retrieved');
});

module.exports = { score, confirm, insights };