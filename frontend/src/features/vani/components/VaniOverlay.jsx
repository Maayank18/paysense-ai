import { useEffect, useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, MicOff, Send, ChevronRight } from 'lucide-react';
import { useVaniStore }       from '../store/vaniStore';
import { useAudioRecorder }   from '../hooks/useAudioRecorder';
import { vaniApi }            from '../vani.api';
import { speak, speakVaniPrompt } from '@/services/groq';
import WaveformPulse          from './WaveformPulse';
import TranscriptBubble       from './TranscriptBubble';
import PaymentConfirm, { PaymentSuccess } from './PaymentConfirm';
import { toast }              from '@/components/ui/Toast';

// ── Quick-hint chips shown in idle state ────────────────────────────────────
const HINTS = [
  'Ramesh ko 500 bhejo',
  'Mera balance check karo',
  'Is hafte kitna kharch hua?',
  'Credit score batao',
];

// ── Overlay backdrop / panel variants ───────────────────────────────────────
const backdropV = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit:    { opacity: 0, transition: { duration: 0.22 } },
};
const panelV = {
  hidden:  { y: '100%', opacity: 0 },
  visible: { y: 0,      opacity: 1, transition: { type: 'spring', damping: 30, stiffness: 380 } },
  exit:    { y: '100%', opacity: 0, transition: { duration: 0.24, ease: [0.32, 0.72, 0, 1] } },
};

export default function VaniOverlay() {
  const {
    isOpen, close, phase, setPhase,
    sessionId, setSessionId,
    transcript, setTranscript,
    confirmPayload, setConfirmPayload,
    result, setResult, setError, reset,
  } = useVaniStore();

  const { start, stop, cancel, isRecording, error: micError } = useAudioRecorder();
  const textRef   = useRef(null);
  const textDraft = useRef('');

  const isProcessing = phase === 'processing';

  // ── Lifecycle ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      reset();
      speakVaniPrompt('ready');
    }
  }, [isOpen]); // eslint-disable-line

  useEffect(() => {
    if (phase === 'success') {
      const t = setTimeout(close, 3000);
      return () => clearTimeout(t);
    }
  }, [phase, close]);

  useEffect(() => {
    if (micError) {
      toast.warn(micError);
      setError(micError);
    }
  }, [micError, setError]);

  // ── Execute a confirmed action ───────────────────────────────────────────
  const executeAction = useCallback(async (sid) => {
    const id = sid || sessionId;
    if (!id) return;
    setPhase('processing');
    try {
      const raw = await vaniApi.execute(id);
      // API interceptor returns full body; actual result is in .data
      const res = raw?.data ?? raw;
      if (res?.ttsText) await speak(res.ttsText);
      setResult(res);
    } catch (err) {
      console.error('[Vani] Execute error:', err);
      setError(err?.message ?? 'Execution failed');
      toast.error('Action failed. Please try again.');
      setPhase('error');
    }
  }, [sessionId, setPhase, setResult, setError]);

  // ── Process any text through the NLU pipeline ────────────────────────────
  const processText = useCallback(async (text, sid) => {
    if (!text?.trim()) return;
    setTranscript(text);
    setPhase('processing');

    try {
      const raw = await vaniApi.pipelineText(text, sid || sessionId || null);
      const res = raw?.data ?? raw;

      const nlu          = res?.nlu ?? res;
      const action       = nlu?.action;
      const prompt       = nlu?.prompt;
      const newSid       = nlu?.session?.sessionId;
      const confirmData  = nlu?.confirmPayload;

      if (newSid && newSid !== sessionId) setSessionId(newSid);
      if (prompt) await speak(prompt);

      switch (action) {
        case 'CONFIRM':
          setConfirmPayload(confirmData);
          break;
        case 'EXECUTE':
        case 'RESPOND':
          await executeAction(newSid || sid || sessionId);
          break;
        case 'RESET':
          setPhase('idle');
          toast.info('Cancelled.');
          break;
        default:
          // CLARIFY → stay in idle waiting for next input
          setPhase('idle');
      }
    } catch (err) {
      console.error('[Vani] Pipeline error:', err);
      toast.error('Samajh nahi aaya. Dobara try karein.');
      setPhase('idle');
    }
  }, [sessionId, setSessionId, setTranscript, setPhase, setConfirmPayload, executeAction]);

  // ── Mic button: tap-to-record / tap-to-stop ──────────────────────────────
  const handleMicTap = useCallback(async () => {
    if (isProcessing) return;

    if (isRecording) {
      // ── Stop & transcribe ──────────────────────────────────────────────
      const audioData = await stop();
      if (!audioData?.blob) { setPhase('idle'); return; }

      setPhase('processing');
      try {
        const formData = new FormData();
        formData.append('audio', audioData.blob, 'recording.webm');
        if (sessionId) formData.append('sessionId', sessionId);

        const raw = await vaniApi.pipeline(formData);
        const res = raw?.data ?? raw;

        const sttText = res?.stt?.transcript;
        const nlu     = res?.nlu;

        if (!sttText) {
          toast.warn('Audio unclear. Please try again or type below.');
          setPhase('idle');
          return;
        }

        setTranscript(sttText);

        const action      = nlu?.action;
        const prompt      = nlu?.prompt;
        const newSid      = nlu?.session?.sessionId;
        const confirmData = nlu?.confirmPayload;

        if (newSid) setSessionId(newSid);
        if (prompt) await speak(prompt);

        switch (action) {
          case 'CONFIRM':  setConfirmPayload(confirmData); break;
          case 'EXECUTE':
          case 'RESPOND':  await executeAction(newSid || sessionId); break;
          case 'RESET':    setPhase('idle'); break;
          default:         setPhase('idle');
        }
      } catch (err) {
        toast.error('Voice processing failed. Type your command below.');
        setPhase('idle');
      }
    } else {
      // ── Start recording ────────────────────────────────────────────────
      setPhase('listening');
      setTranscript('');
      await speakVaniPrompt('listening');
      const ok = await start();
      if (!ok) setPhase('idle');
    }
  }, [isRecording, isProcessing, sessionId, start, stop,
      setPhase, setTranscript, setSessionId, setConfirmPayload, executeAction]);

  // ── Text input submit ────────────────────────────────────────────────────
  const handleTextSubmit = useCallback(async () => {
    const text = textDraft.current?.trim();
    if (!text || isProcessing) return;
    if (isRecording) { cancel(); }
    textDraft.current = '';
    if (textRef.current) textRef.current.value = '';
    await processText(text, sessionId);
  }, [isProcessing, isRecording, sessionId, cancel, processText]);

  // ── Mic button visual state ──────────────────────────────────────────────
  const micStyle = isRecording
    ? { bg: 'linear-gradient(135deg,#FF3D3D,#CC0000)', shadow: '0 0 0 10px rgba(255,61,61,0.15), 0 4px 24px rgba(255,61,61,0.4)' }
    : isProcessing
    ? { bg: 'rgba(255,255,255,0.08)', shadow: 'none' }
    : { bg: 'linear-gradient(135deg,#00BAF2,#0076C8)', shadow: '0 0 0 10px rgba(0,186,242,0.12), 0 4px 24px rgba(0,186,242,0.4)' };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ── Backdrop ─────────────────────────────────────────────────── */}
          <motion.div
            key="vani-bg"
            variants={backdropV}
            initial="hidden" animate="visible" exit="exit"
            className="fixed inset-0 z-[60]"
            style={{ background: 'rgba(0,10,30,0.90)', backdropFilter: 'blur(10px)' }}
            onClick={() => { if (phase === 'idle') close(); }}
          />

          {/* ── Panel ────────────────────────────────────────────────────── */}
          <motion.div
            key="vani-panel"
            variants={panelV}
            initial="hidden" animate="visible" exit="exit"
            className="fixed bottom-0 left-0 right-0 z-[61] mx-auto flex flex-col"
            style={{
              maxWidth: 430,
              borderRadius: '28px 28px 0 0',
              background: 'linear-gradient(170deg, #001428 0%, #002145 65%, #001830 100%)',
              paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
              minHeight: 380,
            }}
          >
            {/* ── Drag handle + header ─────────────────────────────────── */}
            <div className="flex justify-center pt-3 mb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="flex items-center justify-between px-5 py-2">
              <div className="flex items-center gap-2">
                <motion.div
                  className="w-2 h-2 rounded-full bg-paytm-blue"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                />
                <span className="text-white/80 text-[14px] font-[700] tracking-tight">Vani</span>
                <span className="text-white/30 text-[11px]">Hindi Voice UPI</span>
              </div>
              <button
                onClick={close}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20 transition-colors"
              >
                <X size={15} color="white" />
              </button>
            </div>

            {/* ── Main content ─────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-2 gap-5">
              <AnimatePresence mode="wait">

                {/* SUCCESS */}
                {phase === 'success' && result ? (
                  <motion.div key="success" initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="w-full">
                    <PaymentSuccess result={result} />
                  </motion.div>

                ) : phase === 'confirming' && confirmPayload ? (
                  /* CONFIRMING */
                  <motion.div key="confirm" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="w-full">
                    <PaymentConfirm
                      confirmPayload={confirmPayload}
                      onConfirm={() => executeAction(sessionId)}
                      onCancel={() => { reset(); setPhase('idle'); }}
                    />
                  </motion.div>

                ) : (
                  /* MIC / LISTENING / PROCESSING */
                  <motion.div key="mic-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-5 w-full">

                    {/* Transcript or hint text */}
                    {transcript ? (
                      <TranscriptBubble transcript={transcript} phase={phase} />
                    ) : (
                      <div className="text-center px-4">
                        <p className="text-white/65 text-[14px] font-[400] leading-relaxed">
                          {phase === 'processing' ? 'Samajh raha hoon…'
                          : phase === 'listening'  ? 'Bol dijiye…'
                          : 'Mic dabao aur boliye'}
                        </p>

                        {/* Hint chips — only in idle */}
                        {phase === 'idle' && (
                          <div className="flex flex-wrap gap-2 justify-center mt-3">
                            {HINTS.map((hint) => (
                              <button
                                key={hint}
                                onClick={() => processText(hint, sessionId)}
                                className="flex items-center gap-1 text-[11px] font-[500] bg-white/8 border border-white/15 rounded-full px-3 py-1.5 text-white/60 active:bg-white/15 transition-colors"
                              >
                                {hint}
                                <ChevronRight size={10} className="opacity-50" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Waveform */}
                    <WaveformPulse
                      isActive={isRecording || phase === 'processing'}
                      color={isRecording ? '#00BAF2' : 'rgba(255,255,255,0.5)'}
                      barCount={15}
                    />

                    {/* Mic button */}
                    <motion.button
                      onClick={handleMicTap}
                      disabled={isProcessing}
                      className="w-20 h-20 rounded-full flex items-center justify-center disabled:cursor-not-allowed"
                      style={{ background: micStyle.bg, boxShadow: micStyle.shadow }}
                      animate={isRecording ? { scale: [1, 1.06, 1] } : {}}
                      transition={isRecording ? { duration: 1.1, repeat: Infinity } : {}}
                      whileTap={!isProcessing ? { scale: 0.88 } : {}}
                    >
                      {isProcessing ? (
                        <motion.div
                          className="w-6 h-6 border-2 border-white/25 border-t-white rounded-full"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.75, repeat: Infinity, ease: 'linear' }}
                        />
                      ) : isRecording ? (
                        <MicOff size={28} color="white" strokeWidth={2} />
                      ) : (
                        <Mic size={28} color="white" strokeWidth={2} />
                      )}
                    </motion.button>

                    <p className="text-white/35 text-[11px] font-[500]">
                      {isRecording ? 'Phir se tap karein — ruk jaane ke liye' : 'Tap to speak'}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Text fallback input ───────────────────────────────────── */}
            {phase !== 'success' && phase !== 'confirming' && (
              <div className="px-4 pt-1 pb-2">
                <div className="flex gap-2 items-center">
                  <input
                    ref={textRef}
                    type="text"
                    placeholder='Ya type karein — "Ramesh ko 500 bhejo"'
                    onChange={(e) => { textDraft.current = e.target.value; }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleTextSubmit(); }}
                    disabled={isProcessing}
                    className="flex-1 bg-white/10 text-white placeholder-white/25 text-[13px] rounded-xl px-4 py-3 outline-none border border-white/10 focus:border-white/30 transition-colors disabled:opacity-40"
                  />
                  <button
                    onClick={handleTextSubmit}
                    disabled={isProcessing}
                    className="w-11 h-11 rounded-xl bg-paytm-blue flex items-center justify-center flex-shrink-0 active:bg-paytm-blue-dark disabled:opacity-40 transition-colors"
                  >
                    <Send size={17} color="white" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}