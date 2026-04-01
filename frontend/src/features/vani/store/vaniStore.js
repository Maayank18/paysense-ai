import { create } from 'zustand';

export const useVaniStore = create((set) => ({
  isOpen:         false,
  phase:          'idle', // idle | listening | processing | confirming | success | error
  sessionId:      null,
  transcript:     '',
  dialogueAction: null,
  confirmPayload: null,
  result:         null,
  error:          null,

  // ── Actions ────────────────────────────────────────────────────────────
  open:  () => set({ isOpen: true,  phase: 'idle', transcript: '', error: null, result: null }),
  close: () => set({ isOpen: false, phase: 'idle', transcript: '', confirmPayload: null, result: null }),

  /** Generic setter — used by useSocket to update any key */
  setState:          (key, value) => set({ [key]: value }),

  setPhase:          (phase)       => set({ phase }),
  setSessionId:      (id)          => set({ sessionId: id }),
  setTranscript:     (t)           => set({ transcript: t }),
  setDialogueAction: (a)           => set({ dialogueAction: a }),
  setConfirmPayload: (p)           => set({ confirmPayload: p, phase: 'confirming' }),
  setResult:         (r)           => set({ result: r, phase: 'success' }),
  setError:          (e)           => set({ error: e, phase: 'error' }),

  reset: () => set({
    phase: 'idle', transcript: '', confirmPayload: null,
    result: null, error: null, dialogueAction: null,
  }),
}));