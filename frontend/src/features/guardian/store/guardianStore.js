import { create } from 'zustand';

export const useGuardianStore = create((set) => ({
  // ── Active fraud alert (drives GuardianModal) ────────────────────────────
  activeAlert:   null,
  alertHistory:  [],       // last 50 alerts

  // ── Live transaction stream (from Socket.IO mock generator) ───────────────
  streamTxs:     [],       // last 30 transactions

  // ── Insights / spend analysis ─────────────────────────────────────────────
  insights:         null,
  insightsLoading:  false,

  // ── Pay-screen risk scoring state ─────────────────────────────────────────
  scoringResult:    null,
  isScoringLoading: false,

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Called by useSocket when guardian:alert fires */
  addAlert: (alert) => set((s) => ({
    activeAlert:  alert,
    alertHistory: [alert, ...s.alertHistory].slice(0, 50),
  })),

  clearAlert: () => set({ activeAlert: null }),

  /** Called by useSocket on guardian:safe and tx:stream */
  addStreamTx: (tx) => set((s) => ({
    streamTxs: [tx, ...s.streamTxs].slice(0, 30),
  })),

  setScoringResult:  (r) => set({ scoringResult: r, isScoringLoading: false }),
  setScoringLoading: (v) => set({ isScoringLoading: v }),

  setInsights:        (d) => set({ insights: d, insightsLoading: false }),
  setInsightsLoading: (v) => set({ insightsLoading: v }),
}));