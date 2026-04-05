import { motion }       from 'framer-motion';
import { AlertTriangle, ShieldOff, ShieldCheck, X, Clock, Zap } from 'lucide-react';
import BottomSheet       from '@/components/ui/BottomSheet';
import { RiskBar }       from './RiskBadge';
import { formatINR, truncateUpiId, haptic } from '@/utils/helpers';
import { useGuardianStore } from '../store/guardianStore';
import { guardianApi }      from '../guardian.api';
import { toast }            from '@/components/ui/Toast';

const DECISION_CFG = {
  BLOCK: { Icon:ShieldOff,    headerBg:'linear-gradient(135deg,#FF3D3D,#CC0000)', title:'High Risk Transaction',    subtitle:"Multiple fraud signals — we strongly recommend cancelling", accent:'#FF3D3D', proceedLabel:'Proceed Anyway (Risky)', proceedCls:'bg-red-50 text-red-700 border border-red-200' },
  WARN:  { Icon:AlertTriangle,headerBg:'linear-gradient(135deg,#FF8C00,#E65100)', title:'Please Verify Before Sending', subtitle:"Unusual signals detected — confirm this is intended",       accent:'#FF8C00', proceedLabel:'Yes, Proceed Anyway',   proceedCls:'bg-orange-50 text-orange-700 border border-orange-200' },
  ALLOW: { Icon:ShieldCheck,  headerBg:'linear-gradient(135deg,#00C853,#00796B)', title:'Transaction Looks Safe',  subtitle:"No unusual signals detected",                                   accent:'#00C853', proceedLabel:'Send Money',            proceedCls:'bg-green-50 text-green-700 border border-green-200' },
};

// FIX 8: All 6 fraud types with emoji + label + colors
const FRAUD_TYPE_META = {
  PHISHING_ATTEMPT:   { label:'Phishing Detected',      emoji:'🎣', color:'#FF3D3D', bg:'rgba(255,61,61,0.10)' },
  SOCIAL_ENGINEERING: { label:'Social Engineering',     emoji:'🎭', color:'#CC0080', bg:'rgba(204,0,128,0.08)' },
  ACCOUNT_TAKEOVER:   { label:'Account Takeover Risk',  emoji:'🔓', color:'#8B0000', bg:'rgba(139,0,0,0.10)'   },
  VELOCITY_FRAUD:     { label:'Velocity Fraud',         emoji:'⚡', color:'#FF6600', bg:'rgba(255,102,0,0.10)' },
  AMOUNT_ANOMALY:     { label:'Unusual Amount',         emoji:'📊', color:'#FF8C00', bg:'rgba(255,140,0,0.10)' },
  TEMPORAL_ANOMALY:   { label:'Late Night Risk',        emoji:'🌙', color:'#6B48FF', bg:'rgba(107,72,255,0.10)'},
};

function FraudTypeBadge({ fraudType }) {
  // FIX 8: fraudType can be an object (from socket) or just an id string (REST fallback)
  const id   = typeof fraudType === 'string' ? fraudType : fraudType?.id;
  const desc = typeof fraudType === 'object'  ? fraudType?.description : null;
  if (!id) return null;
  const meta = FRAUD_TYPE_META[id];
  if (!meta) return null;

  return (
    <motion.div
      initial={{ opacity:0, scale:0.88 }}
      animate={{ opacity:1, scale:1 }}
      transition={{ delay:0.05, type:'spring', damping:16 }}
      className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-3"
      style={{ background: meta.bg, border: `1.5px solid ${meta.color}40` }}
    >
      <span className="text-lg flex-shrink-0">{meta.emoji}</span>
      <div>
        <p className="text-[11px] font-[800] uppercase tracking-wider" style={{ color: meta.color }}>
          {meta.label}
        </p>
        {desc && <p className="text-[10px] text-ink-3 mt-0.5 leading-relaxed">{desc}</p>}
      </div>
    </motion.div>
  );
}

export default function GuardianModal() {
  const { activeAlert, clearAlert } = useGuardianStore();
  const isOpen = !!activeAlert && activeAlert.decision !== 'ALLOW';
  if (!activeAlert) return null;

  const cfg          = DECISION_CFG[activeAlert.decision] ?? DECISION_CFG.WARN;
  const { Icon }     = cfg;
  const amountRupees = (activeAlert.amountPaise ?? 0) / 100;

  const handleCancel = () => {
    haptic('light');
    clearAlert();
    toast.info('Payment cancelled — good call.');
  };

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
        <div className="flex items-center gap-3 mb-3">
          <motion.div
            initial={{ scale:0 }} animate={{ scale:1 }}
            transition={{ type:'spring', damping:14 }}
            className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0"
          >
            <Icon size={24} color="white" />
          </motion.div>
          <div>
            <motion.h2 initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.08 }}
              className="text-[17px] font-[700] leading-tight">{cfg.title}</motion.h2>
            <p className="text-white/70 text-[11px] mt-0.5 leading-relaxed">{cfg.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-white/45 text-[10px] font-mono">
          {activeAlert.latencyMs && (
            <div className="flex items-center gap-1"><Clock size={9} /><span>Detected in {activeAlert.latencyMs}ms</span></div>
          )}
          <div className="flex items-center gap-1"><Zap size={9} /><span>Groq LPU · RBI FREE-AI</span></div>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 pt-4 pb-2">
        {/* FIX 8: Show fraud type badge from either socket payload or REST payload */}
        {(activeAlert.fraudType) && <FraudTypeBadge fraudType={activeAlert.fraudType} />}

        {/* AI message */}
        {activeAlert.message && (
          <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.15 }}
            className="rounded-2xl p-4 mb-4"
            style={{ background:'#F8F9FF', border:`1.5px solid ${cfg.accent}33` }}
          >
            <p className="text-[10px] font-[700] text-ink-3 uppercase tracking-widest mb-2">
              🤖 Guardian AI — Hinglish Explanation
            </p>
            <p className="text-[13.5px] text-ink leading-relaxed font-[500]">{activeAlert.message}</p>
          </motion.div>
        )}

        {/* Money protected message */}
        {activeAlert.moneyAtRiskMessage && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.18 }}
            className="rounded-xl px-3 py-2 mb-3 flex items-center gap-2"
            style={{ background:'rgba(0,200,83,0.06)', border:'1px solid rgba(0,200,83,0.20)' }}
          >
            <ShieldCheck size={14} className="text-success flex-shrink-0" />
            <p className="text-[12px] text-success font-[600]">{activeAlert.moneyAtRiskMessage}</p>
          </motion.div>
        )}

        {/* Risk bar */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.2 }} className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-[700] text-ink-3 uppercase tracking-wide">Risk Score</span>
            <span className="text-[13px] font-[700]" style={{ color: cfg.accent }}>{activeAlert.score ?? activeAlert.riskScore ?? 0}/100</span>
          </div>
          <RiskBar score={activeAlert.score ?? activeAlert.riskScore ?? 0} />
        </motion.div>

        {/* Transaction detail */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.25 }}
          className="bg-surface rounded-2xl p-4 mb-4"
        >
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-[12px] text-ink-3">Amount</span>
            <span className="text-[17px] font-[800] text-ink">{formatINR(amountRupees)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-ink-3">To</span>
            <span className="text-[12px] font-[600] text-ink font-mono">{truncateUpiId(activeAlert.payeeUpi ?? '')}</span>
          </div>
          {activeAlert.isFirstTimePayee && (
            <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex items-center gap-2">
              <span className="text-[10px] bg-orange-100 text-orange-700 rounded-full px-2 py-0.5 font-[700]">FIRST TIME</span>
              <span className="text-[11px] text-ink-3">Never paid this UPI ID before</span>
            </div>
          )}
        </motion.div>

        {/* SHAP flags */}
        {activeAlert.flags?.length > 0 && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.3 }} className="mb-4">
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
      <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.35 }}
        className="px-5 pb-8 pt-2 flex flex-col gap-3"
      >
        <button onClick={handleCancel} className="btn-primary">✅ Cancel Payment — Stay Safe</button>
        <button onClick={handleProceed} className={`w-full rounded-2xl py-3.5 text-[14px] font-[600] active:scale-[0.98] ${cfg.proceedCls}`}>
          {cfg.proceedLabel}
        </button>
        <p className="text-center text-[10px] text-ink-4">
          Guardian by PaySense AI · Paytm × Groq 2025 Partnership · April 2026
        </p>
      </motion.div>
    </BottomSheet>
  );
}