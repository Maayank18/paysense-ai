'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { AppError, asyncHandler } = require('./errorHandler');

// ─────────────────────────────────────────────────────────────────────────────
// authenticate — validates Bearer JWT from Authorization header
// Attaches decoded payload to req.user
// ─────────────────────────────────────────────────────────────────────────────
const authenticate = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw AppError.unauthorized('Missing or malformed Authorization header');
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = decoded; // { userId, phone, iat, exp }
    next();
  } catch (err) {
    // Let error propagate — errorHandler normalizes JWT errors
    throw err;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// optionalAuth — attaches user if token present, continues if not
// Used for routes where auth enhances response but isn't required
// ─────────────────────────────────────────────────────────────────────────────
const optionalAuth = (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

  try {
    const token = authHeader.slice(7);
    req.user = jwt.verify(token, env.JWT_SECRET);
  } catch {
    // Invalid token → treat as unauthenticated
    req.user = null;
  }
  next();
};

// ─────────────────────────────────────────────────────────────────────────────
// generateToken — creates a signed JWT for a user
// ─────────────────────────────────────────────────────────────────────────────
const generateToken = (userId, phone) => {
  return jwt.sign({ userId, phone }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// DEMO BYPASS — injects demo user for hackathon testing
// Activated when header X-Demo-Mode: true is present in dev mode
// ─────────────────────────────────────────────────────────────────────────────
const demoAuth = (req, _res, next) => {
  if (env.NODE_ENV === 'development' && req.headers['x-demo-mode'] === 'true') {
    req.user = { userId: env.DEMO_USER_ID, phone: '+919876543210' };
    return next();
  }
  return authenticate(req, _res, next);
};

module.exports = { authenticate, optionalAuth, generateToken, demoAuth };