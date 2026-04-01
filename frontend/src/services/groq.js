/**
 * groq.js — Client-side Groq utility for PaySense AI frontend.
 *
 * IMPORTANT: All sensitive AI calls (fraud scoring, NLU, coaching) go through
 * the backend. This client-side module handles only:
 *   1. Text-to-speech synthesis using the Web Speech API (free, no API key)
 *   2. Local TTS fallback queue management
 *   3. Hindi/Hinglish voice selection
 *
 * We deliberately do NOT expose the Groq API key on the frontend.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Web Speech API TTS — works natively in Chrome/Safari/Edge on mobile
// ─────────────────────────────────────────────────────────────────────────────

let _synthesis = null;
let _selectedVoice = null;

const getSynthesis = () => {
  if (typeof window === 'undefined') return null;
  if (!('speechSynthesis' in window)) return null;
  if (!_synthesis) _synthesis = window.speechSynthesis;
  return _synthesis;
};

/**
 * Select the best available Hindi voice.
 * Falls back to en-IN, then any English voice.
 */
const selectHindiVoice = () => {
  const synth = getSynthesis();
  if (!synth) return null;

  const voices = synth.getVoices();
  if (!voices.length) return null;

  // Priority: hi-IN → en-IN → en-US/GB
  const priorities = ['hi-IN', 'hi', 'en-IN', 'en-GB', 'en-US', 'en'];
  for (const lang of priorities) {
    const v = voices.find(v => v.lang.startsWith(lang));
    if (v) return v;
  }
  return voices[0] || null;
};

/**
 * speak — synthesise text via Web Speech API.
 * Returns a Promise that resolves when speech ends.
 *
 * @param {string} text     - Text to speak (Hinglish works in most browsers)
 * @param {object} options  - { rate, pitch, volume, onEnd, onError }
 */
export const speak = (text, options = {}) => {
  return new Promise((resolve, reject) => {
    const synth = getSynthesis();

    if (!synth || !text?.trim()) {
      resolve();
      return;
    }

    // Cancel any current speech
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text.trim());

    // Lazy-init voice
    if (!_selectedVoice) _selectedVoice = selectHindiVoice();
    if (_selectedVoice) utterance.voice = _selectedVoice;

    utterance.lang   = _selectedVoice?.lang || 'hi-IN';
    utterance.rate   = options.rate   ?? 0.92;  // slightly slower for Hinglish clarity
    utterance.pitch  = options.pitch  ?? 1.0;
    utterance.volume = options.volume ?? 0.95;

    utterance.onend = () => {
      options.onEnd?.();
      resolve();
    };

    utterance.onerror = (e) => {
      // 'interrupted' is a normal cancel — not an error
      if (e.error === 'interrupted') { resolve(); return; }
      console.warn('[TTS] Speech error:', e.error);
      options.onError?.(e);
      resolve(); // resolve anyway — don't block UX on TTS failure
    };

    // Chrome bug: voices aren't loaded synchronously on first call
    if (synth.getVoices().length === 0) {
      synth.onvoiceschanged = () => {
        _selectedVoice = selectHindiVoice();
        if (_selectedVoice) utterance.voice = _selectedVoice;
        synth.speak(utterance);
      };
    } else {
      synth.speak(utterance);
    }
  });
};

/**
 * stopSpeaking — cancel any current TTS playback.
 */
export const stopSpeaking = () => {
  getSynthesis()?.cancel();
};

/**
 * isTTSSupported — check if browser supports Web Speech synthesis.
 */
export const isTTSSupported = () => 'speechSynthesis' in window;

/**
 * getAvailableVoices — returns all voices for the current browser.
 * Useful for debugging voice selection on device.
 */
export const getAvailableVoices = () => {
  return getSynthesis()?.getVoices() || [];
};

// ─────────────────────────────────────────────────────────────────────────────
// Vani-specific speech helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Standard Vani responses for common states (avoids unnecessary API calls) */
export const VANI_PROMPTS = {
  ready:       'Namaskar! Main sun raha hoon.',
  listening:   'Boliye…',
  processing:  'Samajh raha hoon…',
  cancelled:   'Theek hai, cancel kar diya.',
  error:       'Dobara try karein please.',
  micDenied:   'Microphone access nahi mila. Text use karein.',
};

/**
 * speakVaniPrompt — speak a pre-defined Vani phrase.
 */
export const speakVaniPrompt = (key, options = {}) => {
  const text = VANI_PROMPTS[key];
  if (!text) return Promise.resolve();
  return speak(text, options);
};