'use strict';

const { getScoreForUser, recomputeScore, getScoreHistory } = require('./scoreup.service');
const { asyncHandler, successResponse } = require('../../middleware/errorHandler');

const getScore = asyncHandler(async (req, res) => {
  const result = await getScoreForUser(req.user.userId);
  return successResponse(res, result, 'Credit score retrieved');
});

const refreshScore = asyncHandler(async (req, res) => {
  const result = await recomputeScore(req.user.userId);
  return successResponse(res, result, 'Credit score refreshed');
});

const getHistory = asyncHandler(async (req, res) => {
  const weeks = Math.min(Number(req.query.weeks) || 8, 52);
  const result = await getScoreHistory(req.user.userId, weeks);
  return successResponse(res, result, 'Score history retrieved');
});

module.exports = { getScore, refreshScore, getHistory };