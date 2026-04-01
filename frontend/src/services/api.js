import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor — attach JWT + demo mode header ────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ps_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Demo mode header — bypasses JWT in dev
  if (import.meta.env.DEV) {
    config.headers['X-Demo-Mode'] = 'true';
  }

  return config;
});

// ── Response interceptor — normalize errors ─────────────────────────────────
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const message = err.response?.data?.message || err.message || 'Network error';
    const code    = err.response?.data?.code    || 'NETWORK_ERROR';
    const status  = err.response?.status         || 0;

    // Auto-logout on 401
    if (status === 401) {
      localStorage.removeItem('ps_token');
      window.location.href = '/';
    }

    return Promise.reject({ message, code, status });
  }
);

export default api;