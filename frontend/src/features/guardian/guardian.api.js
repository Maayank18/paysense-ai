import api from '@/services/api';

export const guardianApi = {
  /** Score a transaction — returns risk result */
  score: (payload) =>
    api.post('/guardian/score', payload),

  /** Confirm a warned/blocked transaction — user chose to proceed */
  confirm: (txId) =>
    api.post(`/guardian/confirm/${txId}`),

  /** Fetch weekly spend insights + AI nudge */
  getInsights: (period = 'week') =>
    api.get(`/guardian/insights?period=${period}`),
};