import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  RefreshCw, ChevronRight, TrendingUp,
  Info, ExternalLink, Shield
} from 'lucide-react';
import PaytmShell from '@/components/layout/PaytmShell';
import CreditRing from '@/features/scoreup/components/CreditRing';
import {
  CoachingCard,
  StreakBadge,
  ScoreFactor,
  EMIAlert,
} from '@/features/scoreup/components/ScoreComponents';
import { useScoreUpStore } from '@/features/scoreup/scoreupStore';
import { scoreupApi } from '@/features/scoreup/scoreupApi';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { formatINR, getScoreLevel, cx } from '@/utils/helpers';

// ── Counterfactual card ("if you do X, score goes up Y") ────────────────────
function CounterfactualCard({ cf, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 * index }}
      className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0"
    >
      <div className="w-8 h-8 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <TrendingUp size={14} className="text-success" />
      </div>
      <div className="flex-1">
        <p className="text-[13px] font-[500] text-ink leading-relaxed">{cf.action}</p>
        <p className="text-[11px] text-ink-3 mt-0.5">{cf.timeframe}</p>
      </div>
      <div className="flex-shrink-0 text-right">
        <span className="text-[14px] font-[800] text-success">+{cf.scoreImprovement}</span>
        <p className="text-[10px] text-ink-3">pts</p>
      </div>
    </motion.div>
  );
}

// ── Score history sparkline ───────────────────────────────────────────────────
function ScoreSparkline({ history }) {
  if (!history?.length) return null;
  const scores = history.map(h => h.score);
  const min = Math.min(...scores) - 5;
  const max = Math.max(...scores) + 5;
  const range = max - min || 1;
  const W = 280, H = 50, PAD = 4;
  const pts = scores.map((s, i) => {
    const x = PAD + (i / (scores.length - 1 || 1)) * (W - PAD * 2);
    const y = H - PAD - ((s - min) / range) * (H - PAD * 2);
    return `${x},${y}`;
  });
  const latest = scores[scores.length - 1];
  const prev   = scores[scores.length - 2];
  const isUp   = latest >= (prev ?? latest);

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] font-[600] text-ink-3">Score History</p>
        <span className={cx('text-[12px] font-[700]', isUp ? 'text-success' : 'text-danger')}>
          {isUp ? '▲' : '▼'} {latest}
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00BAF2" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#00BAF2" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points={pts.join(' ')}
          fill="none"
          stroke="#00BAF2"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Last point dot */}
        {pts.length > 0 && (() => {
          const last = pts[pts.length - 1].split(',');
          return (
            <circle cx={last[0]} cy={last[1]} r="3" fill="#00BAF2" />
          );
        })()}
      </svg>
    </div>
  );
}

// ── Score breakdown table ─────────────────────────────────────────────────────
function FactorBreakdown({ breakdown }) {
  const factors = [
    { key: 'paymentHistory', label: 'Payment History',    max: 35, icon: '✅', desc: 'On-time Postpaid & bill payments' },
    { key: 'utilization',    label: 'Credit Utilization', max: 25, icon: '💳', desc: 'Postpaid balance vs limit' },
    { key: 'creditAge',      label: 'Account Age',        max: 15, icon: '📅', desc: 'Time since first Paytm transaction' },
    { key: 'diversity',      label: 'Behaviour Mix',      max: 15, icon: '🌐', desc: 'Utility bills + category diversity' },
    { key: 'walletHealth',   label: 'Wallet Health',      max: 10, icon: '💰', desc: 'Wallet balance + FASTag usage' },
  ];

  return (
    <div className="px-4 pb-4 flex flex-col gap-3">
      {factors.map((f, i) => (
        <ScoreFactor
          key={f.key}
          label={`${f.icon} ${f.label}`}
          value={breakdown?.[f.key] || 0}
          max={f.max}
          delay={0.05 * i}
        />
      ))}
    </div>
  );
}

export default function ScoreUp() {
  const navigate = useNavigate();
  const { data, isLoading, setData, setLoading, setError } = useScoreUpStore();

  const fetchScore = async (force = false) => {
    if (data && !force) return;
    setLoading(true);
    try {
      const res = await (force ? scoreupApi.refresh() : scoreupApi.getScore());
      setData(res.data);
    } catch (err) {
      setError(err.message);
      toast.error('Could not load credit score');
    }
  };

  useEffect(() => { fetchScore(); }, []);

  const handleRefresh = async () => {
    toast.info('Refreshing your credit score…');
    await fetchScore(true);
    toast.success('Score updated!');
  };

  const { color, label, emoji } = getScoreLevel(data?.score || 0);

  return (
    <PaytmShell
      title="Credit Health"
      showBack
      topBarRight={
        <button
          onClick={handleRefresh}
          className="p-2 ripple rounded-full"
          disabled={isLoading}
        >
          <RefreshCw size={18} className={cx('text-ink-2', isLoading && 'animate-spin')} />
        </button>
      }
    >
      {isLoading && !data ? (
        <div className="px-3 pt-4 flex flex-col gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <div className="pb-6">
          {/* ── Hero score card ──────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white mx-3 mt-4 rounded-2xl shadow-card overflow-hidden"
          >
            {/* Coloured top band */}
            <div
              className="h-2 w-full"
              style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }}
            />

            <div className="p-5">
              {/* Ring + stats */}
              <div className="flex items-center gap-6">
                <CreditRing score={data?.score || 0} size={110} animate={true} showLabel={true} />

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{emoji}</span>
                    <span
                      className="text-[12px] font-[700] uppercase tracking-wide"
                      style={{ color }}
                    >
                      {label} Credit Health
                    </span>
                  </div>

                  <p className="text-[13px] text-ink-2 mb-3">
                    {data?.pointsToNext > 0 ? (
                      <>{data.pointsToNext} pts to next level</>
                    ) : (
                      <>Maximum score achieved! 🎉</>
                    )}
                  </p>

                  {data?.streak > 0 && <StreakBadge streak={data.streak} points={data.totalPoints} />}
                </div>
              </div>

              {/* Last computed */}
              {data?.computedAt && (
                <p className="text-[10px] text-ink-4 mt-3 text-right">
                  Updated {new Date(data.computedAt).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                  })}
                </p>
              )}
            </div>
          </motion.div>

          {/* ── EMI Alert (if present) ───────────────────────────────── */}
          {data?.emiAlert && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="mx-3 mt-3"
            >
              <EMIAlert emiAlert={data.emiAlert} />
            </motion.div>
          )}

          {/* ── AI Coaching card ─────────────────────────────────────── */}
          {data?.coaching && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mx-3 mt-3"
            >
              <CoachingCard coaching={data.coaching} />
            </motion.div>
          )}

          {/* ── Score factors breakdown ──────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.13 }}
            className="bg-white mx-3 mt-3 rounded-2xl shadow-card overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
              <p className="text-[14px] font-[700] text-ink">Score Breakdown</p>
              <Info size={15} className="text-ink-3" />
            </div>
            <FactorBreakdown breakdown={data?.breakdown} />
          </motion.div>

          {/* ── "What if" counterfactuals ────────────────────────────── */}
          {data?.counterfactuals?.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
              className="bg-white mx-3 mt-3 rounded-2xl shadow-card overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-[14px] font-[700] text-ink">Improve Your Score</p>
                <p className="text-[11px] text-ink-3 mt-0.5">
                  Actions you can take today
                </p>
              </div>
              <div className="px-4">
                {data.counterfactuals.map((cf, i) => (
                  <CounterfactualCard key={i} cf={cf} index={i} />
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Postpaid quick card ──────────────────────────────────── */}
          {data?.breakdown && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.19 }}
              className="mx-3 mt-3"
            >
              <button
                className="w-full bg-paytm-navy text-white rounded-2xl p-4 flex items-center justify-between"
                onClick={() => navigate('/pay')}
              >
                <div className="text-left">
                  <p className="text-[13px] font-[700]">Paytm Postpaid</p>
                  <p className="text-[11px] text-blue-200 mt-0.5">
                    Pay your due to boost score
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-[14px] font-[800]">
                      {formatINR((data?.postpaidUtilizedPaise || 320000) / 100)}
                    </p>
                    <p className="text-[10px] text-blue-200">outstanding</p>
                  </div>
                  <ChevronRight size={18} className="text-blue-200" />
                </div>
              </button>
            </motion.div>
          )}

          {/* ── CIBIL disclaimer ────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.22 }}
            className="mx-3 mt-4 p-3 bg-gray-50 rounded-xl border border-gray-100"
          >
            <div className="flex gap-2">
              <Shield size={14} className="text-ink-3 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-ink-3 leading-relaxed">
                This is a <strong>PaySense AI proxy score</strong> based on your Paytm transaction
                behaviour. It is not a CIBIL score and is provided for informational purposes only.
                For your official credit report, visit <span className="text-paytm-blue">cibil.com</span>.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </PaytmShell>
  );
}