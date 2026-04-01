import { io } from 'socket.io-client';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const SOCKET_OPTIONS = {
  transports: ['websocket', 'polling'],
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
};

// ── Guardian namespace ───────────────────────────────────────────────────────
export const guardianSocket = io(`${BASE_URL}/guardian`, SOCKET_OPTIONS);

// ── Vani namespace ───────────────────────────────────────────────────────────
export const vaniSocket = io(`${BASE_URL}/vani`, SOCKET_OPTIONS);

// ── Connect both sockets with userId ────────────────────────────────────────
export const connectSockets = (userId) => {
  if (!guardianSocket.connected) {
    guardianSocket.connect();
    guardianSocket.once('connect', () => {
      guardianSocket.emit('user:join', userId);
      guardianSocket.emit('stream:join'); // join live tx stream
    });
  }

  if (!vaniSocket.connected) {
    vaniSocket.connect();
    vaniSocket.once('connect', () => {
      vaniSocket.emit('user:join', userId);
    });
  }
};

export const disconnectSockets = () => {
  guardianSocket.disconnect();
  vaniSocket.disconnect();
};