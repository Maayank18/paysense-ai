// userStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/services/api';

export const useUserStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: localStorage.getItem('ps_token') || null,
      isLoading: false,
      isAuthenticated: false,

      demoLogin: async () => {
        set({ isLoading: true });
        try {
          const res = await api.post('/user/demo-login');
          const { token, userId, name } = res.data;
          localStorage.setItem('ps_token', token);
          set({ token, isAuthenticated: true, isLoading: false });
          await get().fetchProfile();
          return true;
        } catch (err) {
          set({ isLoading: false });
          return false;
        }
      },

      fetchProfile: async () => {
        try {
          const res = await api.get('/user/profile');
          set({ user: res.data, isAuthenticated: true });
        } catch {
          set({ isAuthenticated: false });
        }
      },

      setUser: (user) => set({ user }),
      logout: () => {
        localStorage.removeItem('ps_token');
        set({ user: null, token: null, isAuthenticated: false });
      },
    }),
    { name: 'ps_user', partialize: (s) => ({ token: s.token }) }
  )
);