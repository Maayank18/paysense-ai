import api from '@/services/api';

/**
 * userApi — all user-related API calls.
 * Thin wrappers around the Axios instance so components never
 * import Axios directly.
 */
export const userApi = {
  /** Get demo JWT — dev only, no auth required */
  demoLogin: () => api.post('/user/demo-login'),

  /** Fetch the authenticated user's profile */
  getProfile: () => api.get('/user/profile'),
};