'use strict';

const { Server } = require('socket.io');
const { initGuardianSocket } = require('../features/guardian/guardian.socket');
const { initVaniSocket } = require('../features/vani/vani.socket');
const env = require('../config/env');

// ─────────────────────────────────────────────────────────────────────────────
// initSocketServer
// Creates the Socket.IO server, attaches it to the HTTP server,
// and registers all feature namespaces.
//
// Namespaces:
//   /guardian  — real-time fraud scoring + transaction stream
//   /vani      — voice session events
//
// NOTE: We use namespaces (not rooms-only) so each module's event handlers
// are fully isolated. A Vani socket error can never affect Guardian.
// ─────────────────────────────────────────────────────────────────────────────
const initSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CLIENT_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Tune for low-latency fintech events
    pingTimeout: 20_000,
    pingInterval: 10_000,
    transports: ['websocket', 'polling'], // WebSocket first, polling as fallback
    maxHttpBufferSize: 26 * 1024 * 1024, // 26MB — covers Whisper audio chunks
    connectionStateRecovery: {
      // Allow clients to resume without losing room membership after brief disconnects
      maxDisconnectionDuration: 30_000,
      skipMiddlewares: true,
    },
  });

  // ── Global middleware — attach userId from query param if present ────
  io.use((socket, next) => {
    const userId = socket.handshake.query?.userId || socket.handshake.auth?.userId;
    if (userId) socket.data.userId = userId;
    next();
  });

  // ── Register feature namespaces ──────────────────────────────────────
  const guardianNS = initGuardianSocket(io);
  const vaniNS = initVaniSocket(io);

  // ── Root namespace — health + connection count ───────────────────────
  io.on('connection', (socket) => {
    console.log(`🔌 [Socket.IO] Root connection: ${socket.id} | Total: ${io.engine.clientsCount}`);

    socket.on('ping', () => socket.emit('pong', { ts: Date.now() }));

    socket.on('disconnect', () => {
      console.log(`🔌 [Socket.IO] Root disconnected: ${socket.id}`);
    });
  });

  // ── Periodic connection count log (dev only) ─────────────────────────
  if (env.NODE_ENV === 'development') {
    setInterval(() => {
      console.log(`📊 [Socket.IO] Active connections: ${io.engine.clientsCount}`);
    }, 60_000);
  }

  console.log('✅  [Socket.IO] Server initialized — namespaces: /guardian, /vani');

  return { io, guardianNS, vaniNS };
};

module.exports = { initSocketServer };