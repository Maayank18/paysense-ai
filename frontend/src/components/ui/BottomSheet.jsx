import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const sheetVariants = {
  hidden:  { y: '100%', opacity: 1 },
  visible: { y: 0,      opacity: 1, transition: { type: 'spring', damping: 32, stiffness: 400 } },
  exit:    { y: '100%', opacity: 1, transition: { duration: 0.24, ease: [0.32, 0.72, 0, 1] } },
};

const backdropVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit:    { opacity: 0, transition: { duration: 0.2 } },
};

export default function BottomSheet({
  open,
  onClose,
  children,
  title,
  snapPoints,     // e.g. ['40%', '80%'] — future enhancement
  showHandle = true,
  closeOnBackdrop = true,
  className = '',
}) {
  const sheetRef = useRef(null);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && open) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
            onClick={closeOnBackdrop ? onClose : undefined}
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            ref={sheetRef}
            variants={sheetVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`fixed bottom-0 left-0 right-0 z-50 mx-auto bg-white rounded-t-3xl overflow-hidden ${className}`}
            style={{ maxWidth: 430, boxShadow: '0 -8px 40px rgba(0,0,0,0.15)' }}
          >
            {/* Handle bar */}
            {showHandle && (
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-gray-200 rounded-full" />
              </div>
            )}

            {/* Title */}
            {title && (
              <div className="px-5 pt-2 pb-3 border-b border-gray-100">
                <h3 className="text-[15px] font-[700] text-ink">{title}</h3>
              </div>
            )}

            {/* Content */}
            <div className="overflow-y-auto" style={{ maxHeight: '85vh' }}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
