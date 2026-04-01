import { motion } from 'framer-motion';
import { AlertTriangle, ShieldOff, ShieldCheck, X, Clock } from 'lucide-react';
import BottomSheet from '@/components/ui/BottomSheet';
import { RiskBar } from './RiskBadge';
import { formatINR, truncateUpiId, haptic } from '@/utils/helpers';
import { useGuardianStore } from '../store/guardianStore';
import { guardianApi }     from '../guardian.api';
import { toast }           from '@/components/ui/Toast';

const DECISION_CFG = {
  BLOCK: { Icon: ShieldOff,    headerBg: 'linear-gradient(135deg,#FF3D3D,#CC0000)', title: 'High Risk Transaction', subtitle: 'Multiple fraud signals detected', accent: '#FF3D3D', proceedLabel: 'Proceed Anyway', proceedCls: 'bg-red-50 text-red-700 border border-red-200' },
  WARN:  { Icon: AlertTriangle,headerBg: 'linear-gradient(135deg,#FF8C00,#E65100)', title: 'Verify Before Sending',  subtitle: 'Please review this payment',    accent: '#FF8C00', proceedLabel: 'Proceed Anyway', proceedCls: 'bg-orange-50 text-orange-700 border border-orange-200' },
  ALLOW: { Icon: ShieldCheck,  headerBg: 'linear-gradient(135deg,#00C853,#00796B)', title: 'Transaction Looks Safe', subtitle: 'No unusual signals detected',    accent: '#00C853', proceedLabel: 'Send Money',    proceedCls: 'bg-green-50 text-green-700 border border-green-200' },
};

export default function GuardianModal() {
  const { activeAlert, clearAlert } = useGuardianStore();
  const isOpen = !!activeAlert && activeAlert.decision !== 'ALLOW';
  if (!activeAlert) return null;

  const cfg = DECISION_CFG[activeAlert.decision] || DECISION_CFG.WARN;
  const { Icon } = cfg;
  const amountRupees = (activeAlert.amountPaise ?? 0) / 100;

  const handleCancel = () => { haptic('light'); clearAlert(); toast.info('Payment cancelled'); };
  const handleProceed = async () => {
    haptic('medium');
    try { if (activeAlert.txId) await guardianApi.confirm(activeAlert.txId); } catch {}
    clearAlert();
    toast.success('Proceeding with payment');
  };

  return (
    <BottomSheet open={isOpen} onClose={handleCancel} showHandle={false} closeOnBackdrop={false}>
      {/* Header */}
      <div className="relative px-5 pt-6 pb-5 text-white" style={{ background: cfg.headerBg }}>
        <button onClick={handleCancel} className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 active:bg-white/30">
          <X size={18} color="white" />
        </button>
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 16 }}
          className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mb-4">
          <Icon size={28} color="white" />
        </motion.div>
        <motion.h2 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="text-[18px] font-[700] mb-1">{cfg.title}</motion.h2>
        <p className="text-white/75 text-[13px]">{cfg.subtitle}</p>
        {activeAlert.latencyMs && (
          <div className="absolute bottom-3 right-4 flex items-center gap-1 text-white/50 text-[10px] font-mono">
            <Clock size={10} />{activeAlert.latencyMs}ms
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-5 pt-4 pb-2">
        {activeAlert.message && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="rounded-2xl p-4 mb-4" style={{ background: '#F8F9FF', border: `1.5px solid ${cfg.accent}33` }}>
            <p className="text-[13.5px] text-ink leading-relaxed font-[500]">🤖 {activeAlert.message}</p>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-[700] text-ink-3 uppercase tracking-wide">Risk Score</span>
            <span className="text-[13px] font-[700]" style={{ color: cfg.accent }}>{activeAlert.score ?? 0}/100</span>
          </div>
          <RiskBar score={activeAlert.score ?? 0} />
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
          className="bg-surface rounded-2xl p-4 mb-4">
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-[12px] text-ink-3">Amount</span>
            <span className="text-[17px] font-[800] text-ink">{formatINR(amountRupees)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-ink-3">Paying To</span>
            <span className="text-[12px] font-[600] text-ink font-mono">{truncateUpiId(activeAlert.payeeUpi ?? '')}</span>
          </div>
          {activeAlert.isFirstTimePayee && (
            <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex items-center gap-1.5">
              <span className="text-[10px] bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-[700]">FIRST TIME</span>
              <span className="text-[11px] text-ink-3">You've never paid this UPI ID</span>
            </div>
          )}
        </motion.div>

        {activeAlert.flags?.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mb-4">
            <p className="text-[11px] font-[700] text-ink-3 uppercase tracking-wide mb-2">
              Risk Signals ({activeAlert.flags.length})
            </p>
            <div className="flex flex-col gap-1.5">
              {activeAlert.flags.map((flag, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-sm flex-shrink-0 mt-0.5">⚠️</span>
                  <span className="text-[12px] text-ink-2 leading-relaxed">{flag}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Buttons */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="px-5 pb-8 pt-2 flex flex-col gap-3">
        <button onClick={handleCancel} className="btn-primary">Cancel Payment</button>
        <button onClick={handleProceed} className={`w-full rounded-2xl py-3.5 text-[14px] font-[600] active:scale-[0.98] ${cfg.proceedCls}`}>
          {cfg.proceedLabel}
        </button>
        <p className="text-center text-[10px] text-ink-4">Assessed by PaySense Guardian · RBI FREE-AI compliant</p>
      </motion.div>
    </BottomSheet>
  );
}