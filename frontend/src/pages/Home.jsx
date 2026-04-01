import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, QrCode, History, Phone, Zap, CreditCard,
  TrendingUp, Grid, ChevronRight, Eye, EyeOff,
} from 'lucide-react';
import PaytmShell      from '@/components/layout/PaytmShell';
import GuardianModal   from '@/features/guardian/components/GuardianModal';
import AnomalyAlert    from '@/features/guardian/components/AnomalyAlert';
import TransactionFeed from '@/features/guardian/components/TransactionFeed';
import VaniFAB         from '@/features/vani/components/VaniFAB';
import VaniOverlay     from '@/features/vani/components/VaniOverlay';
import { useUserStore }     from '@/features/user/store/userStore';
import { useGuardianStore } from '@/features/guardian/store/guardianStore';
import api from '@/services/api';
import {
  formatINR, formatTxDate, getCategoryMeta,
  getInitials, getAvatarColor, getScoreLevel, cx,
} from '@/utils/helpers';

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Single quick-action tile */
function QAction({ icon: Icon, label, onClick, color = '#002970' }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.90 }}
      className="flex flex-col items-center gap-1.5 py-1"
    >
      <div
        className="w-13 h-13 rounded-2xl flex items-center justify-center"
        style={{ background: color + '18', width: 52, height: 52 }}
      >
        <Icon size={22} style={{ color }} strokeWidth={1.8} />
      </div>
      <span className="text-[10.5px] font-[500] text-ink-2 text-center leading-tight max-w-[54px]">
        {label}
      </span>
    </motion.button>
  );
}

/** Balance / wallet hero card */
function BalanceCard({ onPayPress }) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const DEMO_BALANCE = 12_450;

  return (
    <div
      className="mx-3 mt-3 rounded-2xl overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #002970 0%, #003D99 100%)' }}
    >
      {/* Top stripe */}
      <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg,#00BAF2,#0076C8)' }} />

      <div className="p-4">
        {/* Balance row */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-blue-300 text-[11px] font-[600] uppercase tracking-wide mb-1">
              Paytm Wallet
            </p>
            <div className="flex items-center gap-2">
              <span className="text-white text-[26px] font-[800] leading-none">
                {visible ? formatINR(DEMO_BALANCE) : '₹ ••••'}
              </span>
              <button
                onClick={() => setVisible((v) => !v)}
                className="text-blue-300 p-1"
              >
                {visible
                  ? <EyeOff size={14} />
                  : <Eye size={14} />}
              </button>
            </div>
          </div>
          <button
            onClick={() => navigate('/scoreup')}
            className="flex flex-col items-end"
          >
            <span className="text-[9px] text-blue-300 uppercase tracking-wider">ScoreUp</span>
            <span className="text-paytm-blue text-[20px] font-[800] leading-tight">68</span>
            <span className="text-[9px] text-blue-300">/100</span>
          </button>
        </div>

        {/* CTA row */}
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/pay')}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-[700] text-white border border-white/25"
            style={{ background: 'rgba(255,255,255,0.12)' }}
          >
            + Add Money
          </button>
          <button
            onClick={onPayPress}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-[700] text-white"
            style={{ background: 'rgba(0,186,242,0.30)', border: '1px solid rgba(0,186,242,0.50)' }}
          >
            Send Money
          </button>
        </div>
      </div>
    </div>
  );
}

/** Mini transaction row */
function MiniTxRow({ tx }) {
  const meta     = getCategoryMeta(tx.category);
  const { bg, text } = getAvatarColor(tx.payeeName || tx.payeeUpi);
  const isDebit  = tx.status === 'SUCCESS';
  const isFailed = tx.status === 'FAILED';
  const label    = tx.payeeName || tx.payeeUpi?.split('@')[0] || '—';

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0">
      <div
        className="avatar w-9 h-9 text-[12px] font-[700] flex-shrink-0"
        style={{ background: bg, color: text }}
      >
        {getInitials(label)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-[600] text-ink truncate">{label}</p>
        <p className="text-[10px] text-ink-3">{formatTxDate(tx.createdAt)}</p>
      </div>
      <span className={cx('text-[13px] font-[700] flex-shrink-0', isFailed ? 'text-danger' : 'text-ink')}>
        {isFailed ? 'Failed' : `- ${formatINR(tx.amountRupees ?? tx.amountPaise / 100)}`}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  const navigate = useNavigate();
  const user     = useUserStore((s) => s.user);
  const { insights, streamTxs } = useGuardianStore();

  const [recentTxs,        setRecentTxs]        = useState([]);
  const [txLoading,        setTxLoading]         = useState(true);
  const [anomalyDismissed, setAnomalyDismissed]  = useState(false);

  useEffect(() => {
    api.get('/transactions?limit=3')
      .then((res) => {
        const list = res?.transactions ?? res?.data?.transactions ?? [];
        setRecentTxs(list);
      })
      .catch(() => {})
      .finally(() => setTxLoading(false));
  }, []);

  const quickActions = [
    { icon: Send,        label: 'Pay / Send',  onClick: () => navigate('/pay'),     color: '#002970' },
    { icon: QrCode,      label: 'Scan QR',     onClick: () => {},                   color: '#00BAF2' },
    { icon: History,     label: 'History',     onClick: () => navigate('/history'), color: '#7B1FA2' },
    { icon: Phone,       label: 'Recharge',    onClick: () => {},                   color: '#E65100' },
    { icon: Zap,         label: 'Postpaid',    onClick: () => navigate('/scoreup'), color: '#2E7D32' },
    { icon: CreditCard,  label: 'Bills',       onClick: () => {},                   color: '#1565C0' },
    { icon: TrendingUp,  label: 'Insights',    onClick: () => navigate('/insights'),color: '#F5A000' },
    { icon: Grid,        label: 'More',        onClick: () => {},                   color: '#78909C' },
  ];

  const topAnomaly  = insights?.anomalies?.[0] ?? null;
  const showAnomaly = topAnomaly && !anomalyDismissed;

  return (
    <PaytmShell showSearch showBell>
      {/* Global guardian modal — listens to store, renders anywhere */}
      <GuardianModal />

      {/* Balance card */}
      <BalanceCard onPayPress={() => navigate('/pay')} />

      {/* Quick actions */}
      <div className="bg-white mx-3 mt-3 rounded-2xl shadow-card px-3 pt-4 pb-3">
        <div className="grid grid-cols-4 gap-y-3 gap-x-1">
          {quickActions.map((a, i) => <QAction key={i} {...a} />)}
        </div>
      </div>

      {/* Guardian anomaly alert */}
      <AnimatePresence>
        {showAnomaly && (
          <div className="mt-3">
            <AnomalyAlert
              anomaly={topAnomaly}
              onDismiss={() => setAnomalyDismissed(true)}
            />
          </div>
        )}
      </AnimatePresence>

      {/* ScoreUp nudge */}
      <motion.button
        onClick={() => navigate('/scoreup')}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="mx-3 mt-3 w-[calc(100%-24px)] text-left rounded-2xl overflow-hidden shadow-card"
        style={{ background: 'linear-gradient(135deg, #001830 0%, #002B4E 100%)' }}
      >
        <div className="flex items-center justify-between p-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">📈</span>
              <span className="text-[11px] font-[700] text-paytm-blue uppercase tracking-wide">
                ScoreUp — Credit Health
              </span>
            </div>
            <p className="text-white text-[15px] font-[700]">
              Build your credit score
            </p>
            <p className="text-blue-300 text-[11px] mt-0.5">
              Powered by Paytm Postpaid data
            </p>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[28px] font-[800] text-paytm-blue leading-none">68</span>
            <span className="text-[10px] text-blue-300">/ 100</span>
            <ChevronRight size={15} className="text-blue-300 mt-0.5" />
          </div>
        </div>
      </motion.button>

      {/* Recent transactions */}
      <div className="mx-3 mt-3 bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
          <p className="text-[14px] font-[700] text-ink">Recent</p>
          <button
            onClick={() => navigate('/history')}
            className="text-[12px] font-[600] text-paytm-blue"
          >
            See All
          </button>
        </div>

        {txLoading ? (
          <div className="p-3 flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <div className="w-9 h-9 rounded-full skeleton" />
                <div className="flex-1">
                  <div className="skeleton h-3 w-1/2 mb-1.5 rounded" />
                  <div className="skeleton h-2.5 w-1/3 rounded" />
                </div>
                <div className="skeleton h-3.5 w-14 rounded" />
              </div>
            ))}
          </div>
        ) : recentTxs.length > 0 ? (
          recentTxs.map((tx, i) => <MiniTxRow key={tx.txId || i} tx={tx} />)
        ) : (
          <div className="py-8 text-center">
            <p className="text-[13px] text-ink-3">No transactions yet</p>
            <button
              onClick={() => navigate('/pay')}
              className="text-[12px] font-[600] text-paytm-blue mt-1"
            >
              Make your first payment →
            </button>
          </div>
        )}
      </div>

      {/* Guardian live feed (appears once socket stream starts) */}
      {streamTxs.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mx-3 mt-3 mb-3"
        >
          <p className="text-[11px] font-[700] text-ink-3 uppercase tracking-widest mb-2 px-1">
            🛡 Guardian Live Feed
          </p>
          <TransactionFeed maxItems={4} />
        </motion.div>
      )}

      {/* Bottom spacer so FAB doesn't cover last card */}
      <div className="h-20" />

      {/* Vani FAB + Overlay */}
      <VaniFAB />
      <VaniOverlay />
    </PaytmShell>
  );
}