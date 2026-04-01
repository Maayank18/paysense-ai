'use strict';

const { getProfile, getDemoToken } = require('./user.service');
const { asyncHandler, successResponse } = require('../../middleware/errorHandler');
const env = require('../../config/env');

const profile = asyncHandler(async (req, res) => {
  const data = await getProfile(req.user.userId);
  return successResponse(res, data, 'Profile retrieved');
});

// Dev-only: get demo JWT without auth flow
const demoLogin = asyncHandler(async (req, res) => {
  if (env.NODE_ENV === 'production') {
    const { AppError } = require('../../middleware/errorHandler');
    throw AppError.unauthorized('Demo login not available in production');
  }
  const data = await getDemoToken();
  return successResponse(res, data, 'Demo token issued', 200);
});

module.exports = { profile, demoLogin };