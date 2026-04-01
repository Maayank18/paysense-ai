import api from '@/services/api';

export const scoreupApi = {
  /** GET /scoreup — served from Redis cache (<5ms) */
  getScore: () => api.get('/scoreup'),

  /** POST /scoreup/refresh — invalidates cache, recomputes */
  refresh: () => api.post('/scoreup/refresh'),

  /** GET /scoreup/history?weeks=N */
  getHistory: (weeks = 8) => api.get(`/scoreup/history?weeks=${weeks}`),
};