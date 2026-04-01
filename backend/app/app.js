'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { mountRoutes } = require('./routes');
const { errorHandler } = require('../middleware/errorHandler');
const { apiLimiter } = require('../middleware/rateLimit');
const env = require('../config/env');

// ─────────────────────────────────────────────────────────────────────────────
// createApp — builds and configures the Express application.
// Kept separate from server.js so it can be imported by tests cleanly.
// ─────────────────────────────────────────────────────────────────────────────
const createApp = () => {
  const app = express();

  // ── Security headers (Helmet) ─────────────────────────────────────────
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false, // needed for some browser audio APIs
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    })
  );

  // ── CORS ──────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin) return callback(null, true);
        const allowedOrigins = [env.CLIENT_URL, 'http://localhost:5173', 'http://localhost:3000'];
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Demo-Mode', 'X-Device-Id'],
    })
  );

  // ── Body parsers ──────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ── HTTP request logging ──────────────────────────────────────────────
  if (env.NODE_ENV === 'development') {
    app.use(
      morgan(':method :url :status :res[content-length] - :response-time ms', {
        // Skip health check noise
        skip: (req) => req.url === '/health',
      })
    );
  } else {
    // Production: structured JSON logs
    app.use(
      morgan('combined', {
        skip: (req) => req.url === '/health',
      })
    );
  }

  // ── Global rate limit (all routes) ────────────────────────────────────
  app.use('/api', apiLimiter);

  // ── Trust proxy — required for correct req.ip behind Render/Vercel ────
  app.set('trust proxy', 1);

  // ── Attach success response helper to res ─────────────────────────────
  // Allows controllers to use res.success() shorthand
  app.use((_req, res, next) => {
    res.success = (data, message, statusCode = 200, meta = {}) => {
      return res.status(statusCode).json({
        success: true,
        message,
        data,
        ...(Object.keys(meta).length && { meta }),
        timestamp: new Date().toISOString(),
      });
    };
    next();
  });

  // ── Mount all feature routes ───────────────────────────────────────────
  mountRoutes(app);

  // ── Global error handler — MUST be last ──────────────────────────────
  app.use(errorHandler);

  return app;
};

module.exports = { createApp };