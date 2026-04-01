import { motion, AnimatePresence } from 'framer-motion';
import { Mic } from 'lucide-react';
import { useVaniStore } from '../store/vaniStore';

/**
 * VaniFAB
 * Floating mic button anchored above the bottom nav.
 * Opens VaniOverlay on tap. Shows pulsing rings when a session is active.
 */
export default function VaniFAB() {
  const { isOpen, open, phase } = useVaniStore();
  const isActive = isOpen && phase !== 'idle';

  return (
    <div
      className="fixed z-30"
      style={{
        bottom: 'calc(64px + 18px + env(safe-area-inset-bottom, 0px))',
        right: 18,
      }}
    >
      {/* Concentric pulse rings — only while session is live */}
      <AnimatePresence>
        {isActive && [0, 1].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ background: 'rgba(0,186,242,0.25)' }}
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 2.6, opacity: 0 }}
            transition={{
              duration: 1.6,
              repeat: Infinity,
              delay: i * 0.55,
              ease: 'easeOut',
            }}
          />
        ))}
      </AnimatePresence>

      {/* Button */}
      <motion.button
        onClick={open}
        aria-label="Open Vani voice assistant"
        className="relative w-14 h-14 rounded-full flex items-center justify-center"
        style={{
          background: isActive
            ? 'linear-gradient(135deg, #00BAF2 0%, #0076C8 100%)'
            : 'linear-gradient(135deg, #002970 0%, #003D99 100%)',
          boxShadow: isActive
            ? '0 4px 20px rgba(0,186,242,0.55)'
            : '0 4px 16px rgba(0,0,0,0.28)',
        }}
        whileTap={{ scale: 0.90 }}
        whileHover={{ scale: 1.06 }}
        transition={{ type: 'spring', damping: 18, stiffness: 380 }}
      >
        <Mic size={22} color="white" strokeWidth={2} />
      </motion.button>

      {/* Micro label */}
      <p className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-[700] text-ink-3 uppercase tracking-widest pointer-events-none">
        VANI
      </p>
    </div>
  );
}