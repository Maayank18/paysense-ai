import { useState, useCallback } from 'react';
import { useNavigate }   from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Search, Delete, ShieldCheck, ShieldAlert, ShieldOff, Clock, Mic } from 'lucide-react';
import PaytmShell    from '@/components/layout/PaytmShell';
import GuardianModal from '@/features/guardian/components/GuardianModal';
import { RiskBar }   from '@/features/guardian/components/RiskBadge';
import VaniOverlay   from '@/features/vani/components/VaniOverlay';
import { useGuardian }  from '@/features/guardian/hooks/useGuardian';
import { useUserStore } from '@/features/user/store/userStore';
import { useVaniStore } from '@/features/vani/store/vaniStore';
import { toast }        from '@/components/ui/Toast';
import { formatINR, getInitials, getAvatarColor, truncateUpiId, haptic, cx } from '@/utils/helpers';

const KEYS = ['1','2','3','4','5','6','7','8','9','.','0','⌫'];

function NumPad({ value, onChange }) {
  const handleKey = (k) => {
    haptic('light');
    if (k === '⌫') { onChange(value.slice(0,-1) || ''); return; }
    if (k === '.' && value.includes('.')) return;
    if (value.length >= 8) return;
    if (value === '0' && k !== '.') { onChange(k); return; }
    onChange(value + k);
  };
  return (
    <div className="grid grid-cols-3 gap-0 border-t border-gray-100">
      {KEYS.map((k) => (
        <button key={k} onClick={() => handleKey(k)}
          className="h-14 flex items-center justify-center text-[20px] font-[500] active:bg-gray-100 ripple text-ink">
          {k === '⌫' ? <Delete size={20} className="text-ink-2" /> : k}
        </button>
      ))}
    </div>
  );
}

function PayeeChip({ payee, onSelect, isSelected }) {
  const { bg, text } = getAvatarColor(payee.displayName || payee.upiId);
  return (
    <motion.button whileTap={{ scale:0.93 }} onClick={() => onSelect(payee)}
      className={cx('flex flex-col items-center gap-1.5 p-2 rounded-2xl transition-all', isSelected && 'bg-blue-50')}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center text-[14px] font-[700] relative" style={{ background:bg, color:text }}>
        {getInitials(payee.displayName || payee.upiId)}
        {isSelected && <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-paytm-blue flex items-center justify-center"><ShieldCheck size={12} color="white" /></div>}
      </div>
      <span className="text-[10px] font-[500] text-ink-2 max-w-[54px] truncate text-center leading-tight">
        {payee.displayName || payee.upiId.split('@')[0]}
      </span>
    </motion.button>
  );
}

const RISK_CFG = {
  ALLOW: { Icon:ShieldCheck, label:'Transaction Looks Safe',       bg:'bg-green-50 border-green-200',   color:'#00C853' },
  WARN:  { Icon:ShieldAlert, label:'Please Verify Before Sending', bg:'bg-orange-50 border-orange-200', color:'#FF8C00' },
  BLOCK: { Icon:ShieldOff,   label:'High Risk Detected',           bg:'bg-red-50 border-red-200',       color:'#FF3D3D' },
};

const FRAUD_LABELS = {
  PHISHING_ATTEMPT:'🎣 Phishing', SOCIAL_ENGINEERING:'🎭 Social Eng.',
  ACCOUNT_TAKEOVER:'🔓 Takeover', VELOCITY_FRAUD:'⚡ Velocity',
  AMOUNT_ANOMALY:'📊 Amount',     TEMPORAL_ANOMALY:'🌙 Late Night',
};

// Guardian inline result card — shows fraud type badge, latency, message
function GuardianResult({ result }) {
  if (!result) return null;
  const cfg   = RISK_CFG[result.decision] ?? RISK_CFG.ALLOW;
  const score = result.riskScore ?? result.score ?? 0;
  const ftId  = typeof result.fraudType === 'string' ? result.fraudType : result.fraudType?.id;
  const ftLbl = ftId ? FRAUD_LABELS[ftId] : null;

  return (
    <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} className={`rounded-2xl border p-3 ${cfg.bg}`}>
      <div className="flex items-center gap-2 mb-2">
        <cfg.Icon size={15} style={{ color:cfg.color }} />
        <span className="text-[12px] font-[700]" style={{ color:cfg.color }}>{cfg.label}</span>
        <span className="ml-auto text-[11px] font-[700] font-mono" style={{ color:cfg.color }}>{score}/100</span>
      </div>
      {ftLbl && (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 mb-2 text-[10px] font-[700]"
          style={{ color:cfg.color, background:cfg.color+'18' }}>{ftLbl}</span>
      )}
      <RiskBar score={score} />
      {result.metadata?.totalLatencyMs && (
        <div className="flex items-center gap-1 mt-1.5">
          <Clock size={9} className="text-ink-4" />
          <span className="text-[9px] text-ink-4 font-mono">Detected in {result.metadata.totalLatencyMs}ms</span>
        </div>
      )}
      {result.message && (
        <p className="text-[11px] text-ink-2 mt-2 leading-relaxed border-t border-gray-100 pt-2">{result.message}</p>
      )}
    </motion.div>
  );
}

const STEPS = { PAYEE:'payee', AMOUNT:'amount' };

export default function Pay() {
  const navigate   = useNavigate();
  const user       = useUserStore((s) => s.user);
  const { open: openVani } = useVaniStore();
  const { scorePayment, isScoring } = useGuardian();

  const [step,          setStep]        = useState(STEPS.PAYEE);
  const [upiInput,      setUpiInput]    = useState('');
  const [selectedPayee, setPayee]       = useState(null);
  const [amount,        setAmount]      = useState('');
  const [note,          setNote]        = useState('');
  const [guardianRes,   setGuardianRes] = useState(null);
  const [paying,        setPaying]      = useState(false);

  const frequentPayees = user?.frequentPayees ?? [];

  const handleSelectPayee = useCallback((payee) => {
    haptic('light'); setPayee(payee); setUpiInput(payee.upiId); setStep(STEPS.AMOUNT); setGuardianRes(null);
  }, []);

  const handleUpiSubmit = useCallback(() => {
    const id = upiInput.trim();
    if (!id || !id.includes('@')) { toast.warn('Enter a valid UPI ID (e.g. name@paytm)'); return; }
    setPayee({ upiId:id, displayName:'' }); setStep(STEPS.AMOUNT); setGuardianRes(null);
  }, [upiInput]);

  const handlePay = useCallback(async () => {
    const amtRupees = parseFloat(amount);
    if (!amtRupees || amtRupees <= 0) { toast.warn('Enter a valid amount'); return; }
    if (!selectedPayee?.upiId) return;
    haptic('medium');
    setPaying(true);
    const result = await scorePayment(
      { amountPaise:Math.round(amtRupees*100), payeeUpi:selectedPayee.upiId, payeeName:selectedPayee.displayName||'', category:'p2p_transfer', note },
      user?.userId,
    );
    setGuardianRes(result);
    setPaying(false);
    if (result?.decision === 'ALLOW') {
      toast.success(`₹${amtRupees} sent to ${selectedPayee.displayName || selectedPayee.upiId}!`);
      setTimeout(() => navigate('/history'), 1200);
    }
  }, [amount, selectedPayee, note, user, scorePayment, navigate]);

  const amountNum    = parseFloat(amount) || 0;
  const canPay       = amountNum > 0 && selectedPayee?.upiId && !paying && !isScoring;
  const { bg, text } = getAvatarColor(selectedPayee?.displayName || selectedPayee?.upiId || '');

  return (
    <PaytmShell title="Send Money" showBack>
      <GuardianModal />
      <VaniOverlay />
      <AnimatePresence mode="wait">
        {step === STEPS.PAYEE && (
          <motion.div key="payee" initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0,x:-20 }} className="flex flex-col gap-4 p-4">
            {frequentPayees.length > 0 && (
              <div>
                <p className="text-[12px] font-[700] text-ink-3 uppercase tracking-wide mb-3">Recent</p>
                <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth:'none' }}>
                  {frequentPayees.slice(0,8).map((p) => <PayeeChip key={p.upiId} payee={p} isSelected={selectedPayee?.upiId===p.upiId} onSelect={handleSelectPayee} />)}
                </div>
              </div>
            )}
            <div>
              <p className="text-[12px] font-[700] text-ink-3 uppercase tracking-wide mb-2">Enter UPI ID or Mobile</p>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-card">
                  <Search size={16} className="text-ink-3 flex-shrink-0" />
                  <input value={upiInput} onChange={(e) => setUpiInput(e.target.value)} onKeyDown={(e) => { if(e.key==='Enter') handleUpiSubmit(); }}
                    placeholder="name@paytm or 9876543210" className="flex-1 outline-none text-[14px] text-ink placeholder-ink-4" />
                  {upiInput && <button onClick={() => setUpiInput('')} className="text-ink-3 text-sm">✕</button>}
                </div>
                <button onClick={handleUpiSubmit} className="px-4 rounded-2xl bg-paytm-blue text-white text-[13px] font-[700] active:bg-paytm-blue-dark">Next</button>
              </div>
            </div>
            <button onClick={openVani} className="flex items-center gap-3 bg-paytm-navy text-white rounded-2xl p-4 shadow-card">
              <div className="w-10 h-10 rounded-xl bg-paytm-blue flex items-center justify-center flex-shrink-0"><Mic size={18} color="white" /></div>
              <div className="text-left">
                <p className="text-[13px] font-[700]">Vani se bhejein</p>
                <p className="text-[11px] text-blue-300">"Ramesh ko 500 bhejo" — boliye</p>
              </div>
            </button>
          </motion.div>
        )}

        {step === STEPS.AMOUNT && selectedPayee && (
          <motion.div key="amount" initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0,x:-20 }} className="flex flex-col">
            <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 bg-white">
              <button onClick={() => { setStep(STEPS.PAYEE); setGuardianRes(null); }} className="p-1 ripple rounded-full"><ArrowLeft size={20} className="text-ink-2" /></button>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-[700]" style={{ background:bg, color:text }}>{getInitials(selectedPayee.displayName || selectedPayee.upiId)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-[700] text-ink">{selectedPayee.displayName || 'Send Money'}</p>
                <p className="text-[11px] text-ink-3 font-mono">{truncateUpiId(selectedPayee.upiId)}</p>
              </div>
            </div>

            <div className="bg-white px-6 py-6 text-center">
              <p className="text-[11px] font-[600] text-ink-3 uppercase tracking-wide mb-2">Enter Amount</p>
              <div className="flex items-baseline justify-center gap-1 mb-1">
                <span className="text-[28px] font-[500] text-ink-3">₹</span>
                <span className={cx('text-[42px] font-[800] tabular-nums leading-none', amountNum>0?'text-ink':'text-ink-4')}>{amount||'0'}</span>
              </div>
              {amountNum > 0 && <p className="text-[12px] text-ink-3">{formatINR(amountNum)}</p>}
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" maxLength={60}
                className="mt-3 w-full text-center outline-none text-[13px] text-ink-2 placeholder-ink-4 bg-transparent border-b border-gray-100 pb-2" />
            </div>

            {guardianRes && <div className="px-4 pb-2"><GuardianResult result={guardianRes} /></div>}

            <div className="flex gap-2 px-4 py-2 overflow-x-auto" style={{ scrollbarWidth:'none' }}>
              {[100,200,500,1000,2000].map((v) => (
                <button key={v} onClick={() => { haptic('light'); setAmount(String(v)); }}
                  className={cx('flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-[600] border transition-colors',
                    amount===String(v)?'bg-paytm-blue text-white border-paytm-blue':'bg-white text-ink-2 border-gray-200')}>
                  ₹{v}
                </button>
              ))}
            </div>

            <NumPad value={amount} onChange={setAmount} />

            <div className="px-4 py-4">
              <button onClick={handlePay} disabled={!canPay}
                className={cx('btn-primary flex items-center justify-center gap-2', !canPay&&'opacity-50 cursor-not-allowed')}>
                {paying||isScoring ? (
                  <><motion.div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" animate={{ rotate:360 }} transition={{ duration:0.75,repeat:Infinity,ease:'linear' }} />Checking with Guardian…</>
                ) : (
                  <><ShieldCheck size={18} />{amountNum>0?`Pay ${formatINR(amountNum)}`:'Enter Amount to Pay'}</>
                )}
              </button>
              <p className="text-center text-[10px] text-ink-4 mt-2">🛡 Secured by PaySense Guardian · NPCI UPI · RBI FREE-AI</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PaytmShell>
  );
}