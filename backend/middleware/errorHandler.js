'use strict';

const env = require('../config/env');

// ─────────────────────────────────────────────────────────────────────────────
// AppError — structured operational error
// All intentional errors in the system should throw AppError.
// Unexpected/programmer errors will be caught by the global handler below.
// ─────────────────────────────────────────────────────────────────────────────
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', meta = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.meta = meta;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Common factory constructors — keeps controller code clean
// ─────────────────────────────────────────────────────────────────────────────
AppError.badRequest = (msg, code = 'BAD_REQUEST', meta = {}) =>
  new AppError(msg, 400, code, meta);

AppError.unauthorized = (msg = 'Unauthorized') =>
  new AppError(msg, 401, 'UNAUTHORIZED');

AppError.notFound = (resource = 'Resource') =>
  new AppError(`${resource} not found`, 404, 'NOT_FOUND');

AppError.tooManyRequests = (msg = 'Too many requests') =>
  new AppError(msg, 429, 'RATE_LIMITED');

AppError.serviceUnavailable = (service = 'Service') =>
  new AppError(`${service} is temporarily unavailable`, 503, 'SERVICE_UNAVAILABLE');

// ─────────────────────────────────────────────────────────────────────────────
// Mongoose error normalizer — converts DB errors to clean AppErrors
// ─────────────────────────────────────────────────────────────────────────────
const normalizeMongooseError = (err) => {
  // Duplicate key (unique constraint violation)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return AppError.badRequest(
      `Duplicate value for ${field}`,
      'DUPLICATE_KEY',
      err.keyValue
    );
  }
  // Validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return AppError.badRequest('Validation failed', 'VALIDATION_ERROR', { errors });
  }
  // Cast error (invalid ObjectId etc.)
  if (err.name === 'CastError') {
    return AppError.badRequest(
      `Invalid ${err.path}: ${err.value}`,
      'CAST_ERROR'
    );
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Standardized success response helper
// Use: return res.success(data, 'User created', 201)
// ─────────────────────────────────────────────────────────────────────────────
const successResponse = (res, data = null, message = 'Success', statusCode = 200, meta = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...(Object.keys(meta).length && { meta }),
    timestamp: new Date().toISOString(),
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Express error-handling middleware (must be 4-arg)
// Must be registered LAST in app.js
// ─────────────────────────────────────────────────────────────────────────────
const errorHandler = (err, req, res, _next) => {
  // Normalize Mongoose errors first
  const mongoErr = normalizeMongooseError(err);
  if (mongoErr) return errorHandler(mongoErr, req, res, _next);

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return errorHandler(AppError.unauthorized('Invalid token'), req, res, _next);
  }
  if (err.name === 'TokenExpiredError') {
    return errorHandler(AppError.unauthorized('Token expired'), req, res, _next);
  }

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return errorHandler(
      AppError.badRequest('Audio file too large (max 25MB)', 'FILE_TOO_LARGE'),
      req, res, _next
    );
  }

  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational === true;

  // Log all errors — but only stack traces for unexpected (non-operational) errors
  if (!isOperational) {
    console.error('🔥 [UNEXPECTED ERROR]', {
      path: req.path,
      method: req.method,
      error: err.message,
      stack: err.stack,
    });
  } else if (statusCode >= 500) {
    console.error('⚠️  [OPERATIONAL 5xx]', {
      path: req.path,
      code: err.code,
      message: err.message,
    });
  }

  const payload = {
    success: false,
    code: err.code || 'INTERNAL_ERROR',
    message: isOperational ? err.message : 'An unexpected error occurred',
    ...(err.meta && Object.keys(err.meta).length && { details: err.meta }),
    timestamp: new Date().toISOString(),
  };

  // Include stack trace in development only
  if (env.NODE_ENV === 'development' && !isOperational) {
    payload.stack = err.stack;
  }

  return res.status(statusCode).json(payload);
};

// ─────────────────────────────────────────────────────────────────────────────
// Async route wrapper — eliminates try/catch boilerplate in every controller
// Usage: router.post('/path', asyncHandler(async (req, res) => { … }))
// ─────────────────────────────────────────────────────────────────────────────
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { AppError, errorHandler, asyncHandler, successResponse };