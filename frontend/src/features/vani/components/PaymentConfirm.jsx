import { motion } from 'framer-motion';
import { CheckCircle2, ArrowRight, User } from 'lucide-react';
import { formatINR, getInitials, getAvatarColor } from '@/utils/helpers';

/**
 * PaymentConfirm — full confirmation card shown when Vani has all slots filled.
 * Renders inside VaniOverlay before the user says "Haan" to confirm.
 */
export default function PaymentConfirm({ confirmPayload, onConfirm, onCancel }) {
  if (!confirmPayload) return null;

  const { payee, upiId, amountRupees, amountPaise } = confirmPayload;
  const amount = amountRupees ?? (amountPaise ? amountPaise / 100 : 0);

  const initials = payee ? getInitials(payee) : '?';
  const { bg, text } = getAvatarColor(payee || '');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.96 }}
      transition={{ type: 'spring', damping: 26, stiffness: 360 }}
      className="w-full bg-white rounded-2xl overflow-hidden shadow-xl"
    >
      {/* Header strip */}
      <div className="h-1 w-full bg-gradient-to-r from-paytm-blue to-paytm-blue-dark" />

      <div className="p-5">
        {/* Label */}
        <p className="text-[11px] font-[700] text-ink-3 uppercase tracking-widest mb-4 text-center">
          Confirm Payment
        </p>

        {/* Payee avatar + name */}
        <div className="flex flex-col items-center gap-3 mb-5">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-[800]"
            style={{ background: bg, color: text }}
          >
            {initials}
          </div>
          <div className="text-center">
            <p className="text-[17px] font-[700] text-ink">{payee || 'Unknown'}</p>
            {upiId && (
              <p className="text-[11px] text-ink-3 mt-0.5 font-mono">{upiId}</p>
            )}
          </div>
        </div>

        {/* Amount */}
        <div
          className="rounded-2xl p-4 mb-5 text-center"
          style={{ background: '#F4F6FF', border: '1.5px solid #E0E7FF' }}
        >
          <p className="text-[12px] font-[600] text-ink-3 mb-1">Amount</p>
          <motion.p
            className="text-[32px] font-[800] text-ink"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, type: 'spring', damping: 18 }}
          >
            {formatINR(amount)}
          </motion.p>
        </div>

        {/* Action buttons */}
        <button
          onClick={onConfirm}
          className="btn-primary flex items-center justify-center gap-2 mb-2"
        >
          <CheckCircle2 size={18} />
          Haan, Bhejo — Confirm
        </button>

        <button
          onClick={onCancel}
          className="w-full py-3 text-[14px] font-[600] text-ink-3 transition-colors active:text-ink"
        >
          Nahi, Cancel
        </button>

        {/* Security note */}
        <p className="text-center text-[10px] text-ink-4 mt-2">
          🔒 Secured by PaySense Guardian
        </p>
      </div>
    </motion.div>
  );
}

/**
 * PaymentSuccess — shown after successful Vani-initiated payment
 */
export function PaymentSuccess({ result }) {
  if (!result) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 18 }}
      className="flex flex-col items-center gap-4 py-4"
    >
      {/* Animated checkmark */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', damping: 14, delay: 0.1 }}
        className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg"
      >
        <CheckCircle2 size={44} className="text-success" strokeWidth={1.5} />
      </motion.div>

      {/* Message */}
      {result.ttsText && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="text-white text-[16px] font-[600] text-center leading-relaxed px-4"
        >
          {result.ttsText}
        </motion.p>
      )}

      {/* Txn ID */}
      {result.txId && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="text-white/40 text-[11px] font-mono"
        >
          TXN: …{result.txId.slice(-8).toUpperCase()}
        </motion.p>
      )}
    </motion.div>
  );
}