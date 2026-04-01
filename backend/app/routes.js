'use strict';

const guardianRoutes = require('../features/guardian/guardian.routes');
const vaniRoutes = require('../features/vani/vani.routes');
const scoreupRoutes = require('../features/scoreup/scoreup.routes');
const userRoutes = require('../features/user/user.routes');
const { asyncHandler, successResponse } = require('../middleware/errorHandler');

// ─────────────────────────────────────────────────────────────────────────────
// mountRoutes — registers all feature routes on the Express app
// Versioned under /api/v1 for forward compatibility
// ─────────────────────────────────────────────────────────────────────────────
const mountRoutes = (app) => {
  // ── Health check — no auth, always fast ──────────────────────────────
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'paysense-backend',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
    });
  });

  // ── API routes ────────────────────────────────────────────────────────
  app.use('/api/user', userRoutes);
  app.use('/api/guardian', guardianRoutes);
  app.use('/api/vani', vaniRoutes);
  app.use('/api/scoreup', scoreupRoutes);

  // ── Transactions (simple read-only history) ───────────────────────────
  app.get(
    '/api/transactions',
    require('../middleware/auth').demoAuth,
    asyncHandler(async (req, res) => {
      const { getHistory } = require('../features/transaction/transaction.service');
      const { limit, page, category, status } = req.query;
      const data = await getHistory(req.user.userId, {
        limit: Number(limit) || 20,
        page: Number(page) || 1,
        category,
        status,
      });
      return successResponse(res, data, 'Transactions retrieved');
    })
  );

  app.get(
    '/api/transactions/:txId',
    require('../middleware/auth').demoAuth,
    asyncHandler(async (req, res) => {
      const { getById } = require('../features/transaction/transaction.service');
      const data = await getById(req.params.txId, req.user.userId);
      return successResponse(res, data, 'Transaction retrieved');
    })
  );

  // ── 404 handler — must be LAST route ─────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      timestamp: new Date().toISOString(),
    });
  });
};

module.exports = { mountRoutes };