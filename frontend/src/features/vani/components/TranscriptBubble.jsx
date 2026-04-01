import { motion, AnimatePresence } from 'framer-motion';
import { cx } from '@/utils/helpers';

/**
 * TranscriptBubble — shows live speech-to-text output while Vani processes.
 * Appears as a speech bubble with a typing cursor effect.
 */
export default function TranscriptBubble({ transcript = '', phase = 'idle' }) {
  const show = !!transcript && phase !== 'success' && phase !== 'idle';

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.96 }}
          transition={{ type: 'spring', damping: 24, stiffness: 380 }}
          className="w-full"
        >
          {/* Speech bubble */}
          <div
            className="relative rounded-2xl rounded-bl-sm px-4 py-3.5 backdrop-blur-sm"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}
          >
            {/* Quote icon */}
            <span
              className="absolute -top-2 -left-1 text-white/40 font-serif leading-none select-none"
              style={{ fontSize: 28 }}
            >
              "
            </span>

            <p className="text-white text-[15px] font-[500] leading-relaxed text-center px-2">
              {transcript}
              {/* Blinking cursor while still listening */}
              {phase === 'listening' && (
                <motion.span
                  className="inline-block w-0.5 h-4 bg-white/70 ml-0.5 align-middle"
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                />
              )}
            </p>

            {/* Phase label */}
            {phase === 'processing' && (
              <p className="text-white/50 text-[11px] text-center mt-1.5 font-[500]">
                Analysing…
              </p>
            )}
          </div>

          {/* Bubble tail */}
          <div
            className="ml-4 w-3 h-2 overflow-hidden"
            style={{ marginTop: -1 }}
          >
            <div
              className="w-3 h-3 rotate-45 rounded-sm"
              style={{ background: 'rgba(255,255,255,0.15)', marginTop: -6 }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * TranscriptHistory — shows past turns in a conversation scroll view
 */
export function TranscriptHistory({ turns = [] }) {
  if (!turns.length) return null;

  return (
    <div className="w-full flex flex-col gap-2 max-h-32 overflow-y-auto">
      {turns.map((turn, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: turn.role === 'user' ? 12 : -12 }}
          animate={{ opacity: 1, x: 0 }}
          className={cx(
            'px-3 py-2 rounded-xl text-[12px] max-w-[80%]',
            turn.role === 'user'
              ? 'self-end bg-white/20 text-white'
              : 'self-start bg-black/20 text-white/80'
          )}
        >
          {turn.text}
        </motion.div>
      ))}
    </div>
  );
}