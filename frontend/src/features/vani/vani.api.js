import api from '@/services/api';

export const vaniApi = {
  /** Create a new dialogue session — returns { sessionId } */
  createSession: () =>
    api.post('/vani/session'),

  /** Combined STT + NLU pipeline — audio file via FormData */
  pipeline: (formData) =>
    api.post('/vani/pipeline', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  /** Text-only pipeline — for noisy-room fallback */
  pipelineText: (text, sessionId) =>
    api.post('/vani/pipeline', { text, sessionId }),

  /** NLU only — pass a transcript string, get intent + dialogue response */
  understand: (transcript, sessionId) =>
    api.post('/vani/understand', { transcript, sessionId }),

  /** Execute the confirmed dialogue action */
  execute: (sessionId) =>
    api.post('/vani/execute', { sessionId }),
};