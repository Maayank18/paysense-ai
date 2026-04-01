import { create } from 'zustand';

export const useScoreUpStore = create((set) => ({
  data:      null,
  isLoading: false,
  error:     null,

  setData:    (data) => set({ data, isLoading: false, error: null }),
  setLoading: (v)    => set({ isLoading: v }),
  setError:   (e)    => set({ error: e, isLoading: false }),
  reset:      ()     => set({ data: null, isLoading: false, error: null }),
}));