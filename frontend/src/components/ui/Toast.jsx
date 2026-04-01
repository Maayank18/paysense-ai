import { create } from 'zustand';
import { AnimatePresence, motion } from 'framer-motion';

// ── Zustand toast store ──────────────────────────────────────────────────────
export const useToastStore = create((set, get) => ({
  toasts: [],
  show: ({ message, type = 'info', duration = 3000 }) => {
    const id = Date.now();
    set(s => ({ toasts: [...s.toasts.slice(-2), { id, message, type }] }));
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, duration);
  },
}));

export const toast = {
  success: (msg, d) => useToastStore.getState().show({ message: msg, type: 'success', duration: d }),
  error:   (msg, d) => useToastStore.getState().show({ message: msg, type: 'error',   duration: d }),
  info:    (msg, d) => useToastStore.getState().show({ message: msg, type: 'info',    duration: d }),
  warn:    (msg, d) => useToastStore.getState().show({ message: msg, type: 'warn',    duration: d }),
};

const TYPE_STYLES = {
  success: { bg: '#E8F9EE', border: '#00C853', text: '#007A2F', icon: '✅' },
  error:   { bg: '#FFF0F0', border: '#FF3D3D', text: '#CC0000', icon: '❌' },
  warn:    { bg: '#FFF3E0', border: '#FF8C00', text: '#CC6600', icon: '⚠️' },
  info:    { bg: '#E6F8FE', border: '#00BAF2', text: '#0098CC', icon: 'ℹ️' },
};

export default function ToastContainer() {
  const toasts = useToastStore(s => s.toasts);

  return (
    <div className="fixed top-4 left-0 right-0 z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none"
         style={{ maxWidth: 430, margin: '0 auto' }}>
      <AnimatePresence>
        {toasts.map(t => {
          const style = TYPE_STYLES[t.type] || TYPE_STYLES.info;
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.22, type: 'spring', damping: 25 }}
              className="pointer-events-auto w-full rounded-2xl px-4 py-3 flex items-center gap-3 text-sm font-500"
              style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.text,
                       boxShadow: '0 4px 16px rgba(0,0,0,0.10)' }}
            >
              <span className="text-base flex-shrink-0">{style.icon}</span>
              <span className="flex-1 font-[500]">{t.message}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}