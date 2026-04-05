import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { useGuardianStore } from '../store/guardianStore';
import { formatINR, getCategoryMeta, truncateUpiId, cx } from '@/utils/helpers';

const FRAUD_TYPE_COLOR = {
  PHISHING_ATTEMPT:'#FF3D3D', SOCIAL_ENGINEERING:'#CC0080',
  ACCOUNT_TAKEOVER:'#8B0000', VELOCITY_FRAUD:'#FF6600',
  AMOUNT_ANOMALY:'#FF8C00',   TEMPORAL_ANOMALY:'#6B48FF',
};
const FRAUD_TYPE_LABEL = {
  PHISHING_ATTEMPT:'🎣 Phishing', SOCIAL_ENGINEERING:'🎭 Social Eng.',
  ACCOUNT_TAKEOVER:'🔓 Takeover', VELOCITY_FRAUD:'⚡ Velocity',
  AMOUNT_ANOMALY:'📊 Amount',     TEMPORAL_ANOMALY:'🌙 Late Night',
};

const RISK_ICON = {
  ALLOW: <ShieldCheck size={13} className="text-success" />,
  WARN:  <ShieldAlert size={13} className="text-warning" />,
  BLOCK: <ShieldOff  size={13} className="text-danger"  />,
};

function TxItem({ tx, index }) {
  const meta    = getCategoryMeta(tx.category || 'other');
  const isRisky = tx.decision === 'WARN' || tx.decision === 'BLOCK';
  const ftColor = tx.fraudType ? FRAUD_TYPE_COLOR[tx.fraudType] : null;
  const ftLabel = tx.fraudType ? FRAUD_TYPE_LABEL[tx.fraudType] : null;

  return (
    <motion.div
      layout
      initial={{ opacity:0, x:-14 }}
      animate={{ opacity:1, x:0 }}
      exit={{ opacity:0, height:0, overflow:'hidden' }}
      transition={{ duration:0.22, delay:index*0.03, ease:'easeOut' }}
      className={cx('flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0', isRisky&&'bg-orange-50/60')}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ background:meta.color+'1A' }}>
        {meta.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
          <span className="text-[13px] font-[600] text-ink truncate">{tx.payeeName || truncateUpiId(tx.payeeUpi||'',18)}</span>
          {tx.isMock && <span className="text-[9px] bg-blue-50 text-paytm-blue rounded px-1 font-[600] flex-shrink-0">LIVE</span>}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-ink-3">{meta.label}</span>
          {ftLabel && ftColor && (
            <span className="text-[9px] font-[700] rounded px-1.5 py-0.5"
              style={{ color:ftColor, background:ftColor+'18' }}>{ftLabel}</span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className={cx('text-[13px] font-[700]', isRisky?'text-warning':'text-ink')}>
          {formatINR(tx.amountRupees ?? (tx.amountPaise/100) ?? 0)}
        </span>
        <div className="flex items-center gap-1">
          {RISK_ICON[tx.decision] ?? RISK_ICON.ALLOW}
          {tx.score != null && <span className="text-[10px] font-mono text-ink-4">{tx.score}</span>}
        </div>
      </div>
    </motion.div>
  );
}

export default function TransactionFeed({ maxItems = 8 }) {
  const streamTxs = useGuardianStore((s) => s.streamTxs);
  const visible   = streamTxs.slice(0, maxItems);

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <motion.span className="w-2 h-2 bg-success rounded-full" animate={{ opacity:[1,0.3,1] }} transition={{ duration:1.5,repeat:Infinity }} />
          <span className="text-[13px] font-[700] text-ink">Live Transaction Feed</span>
        </div>
        <span className="text-[11px] text-ink-3 font-mono">{streamTxs.length} total</span>
      </div>
      {visible.length === 0 ? (
        <div className="py-10 flex flex-col items-center gap-2 text-ink-3">
          <Shield size={28} strokeWidth={1.5} />
          <p className="text-[13px] font-[500]">Waiting for transactions…</p>
          <p className="text-[11px] text-ink-4">Guardian is watching</p>
        </div>
      ) : (
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((tx, i) => <TxItem key={tx.txId??i} tx={tx} index={i} />)}
        </AnimatePresence>
      )}
    </div>
  );
}