import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, TrendingUp, TrendingDown, Minus,
  Shield, AlertTriangle, ChevronRight,
} from 'lucide-react';
import PaytmShell    from '@/components/layout/PaytmShell';
import SpendCard     from '@/features/guardian/components/SpendCard';
import AnomalyAlert  from '@/features/guardian/components/AnomalyAlert';
import { useGuardian }      from '@/features/guardian/hooks/useGuardian';
import { useGuardianStore } from '@/features/guardian/store/guardianStore';
import { CardSkeleton }     from '@/components/ui/Skeleton';
import { toast }            from '@/components/ui/Toast';
import { formatINR, getCategoryMeta, cx } from '@/utils/helpers';

// ─────────────────────────────────────────────────────────────────────────────
// Period selector tab
// ─────────────────────────────────────────────────────────────────────────────
function PeriodTab({ label, value, active, onClick }) {
  return (
    <button
      onClick={() => onClick(value)}
      className={cx(
        'flex-1 py-2 text-[13px] font-[700] rounded-xl transition-all',
        active
          ? 'bg-paytm-blue text-white shadow-sm'
          : 'text-ink-3',
      )}
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Category bar row
// ─────────────────────────────────────────────────────────────────────────────
function CategoryBar({ category, amountPaise, totalPaise, rank }) {
  const meta  = getCategoryMeta(category);
  const pct   = totalPaise > 0 ? Math.round((amountPaise / totalPaise) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.04 }}
      className="flex items-center gap-3 py-2.5"
    >
      {/* Icon */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
        style={{ background: meta.color + '18' }}
      >
        {meta.emoji}
      </div>

      {/* Bar + label */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-[12px] font-[600] text-ink truncate">{meta.label}</span>
          <span className="text-[12px] font-[700] text-ink ml-2 flex-shrink-0">
            {formatINR(amountPaise / 100)}
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: meta.color }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.7, delay: rank * 0.04, ease: [0.4, 0, 0.2, 1] }}
          />
        </div>
      </div>

      {/* Percent */}
      <span className="text-[11px] font-[700] text-ink-3 w-8 text-right flex-shrink-0">
        {pct}%
      </span>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat chip (summary row)
// ─────────────────────────────────────────────────────────────────────────────
function StatChip({ label, value, trend, color }) {
  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor = trend > 0 ? '#FF3D3D' : trend < 0 ? '#00C853' : '#8A8AA8';
  return (
    <div className="flex-1 bg-white rounded-2xl p-3 shadow-card text-center">
      <p className="text-[10px] font-[600] text-ink-3 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-[17px] font-[800] text-ink leading-none">{value}</p>
      {trend !== undefined && (
        <div className="flex items-center justify-center gap-0.5 mt-1">
          <TrendIcon size={10} style={{ color: trendColor }} />
          <span className="text-[10px] font-[600]" style={{ color: trendColor }}>
            {Math.abs(trend)}%
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function Insights() {
  const [period,     setPeriod]     = useState('week');
  const [refreshing, setRefreshing] = useState(false);
  const [dismissed,  setDismissed]  = useState([]);

  const { loadInsights, isScoring } = useGuardian();
  const { insights, insightsLoading } = useGuardianStore();

  useEffect(() => {
    loadInsights(period);
  }, [period]); // eslint-disable-line

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInsights(period);
    setRefreshing(false);
    toast.success('Insights updated');
  };

  const isLoading = insightsLoading || refreshing;
  const summary   = insights?.summary;
  const anomalies = (insights?.anomalies ?? []).filter((a) => !dismissed.includes(a.category));
  const categories = Object.entries(summary?.categories ?? {})
    .map(([cat, paise]) => ({ category: cat, amountPaise: paise }))
    .sort((a, b) => b.amountPaise - a.amountPaise)
    .slice(0, 6);
  const totalPaise = categories.reduce((s, c) => s + c.amountPaise, 0);

  return (
    <PaytmShell
      title="Spend Insights"
      showBack
      topBarRight={
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="p-2 ripple rounded-full"
        >
          <RefreshCw size={17} className={cx('text-ink-2', isLoading && 'animate-spin')} />
        </button>
      }
    >
      {/* Period tabs */}
      <div className="px-4 pt-4 pb-1">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          <PeriodTab label="This Week"  value="week"  active={period === 'week'}  onClick={setPeriod} />
          <PeriodTab label="This Month" value="month" active={period === 'month'} onClick={setPeriod} />
        </div>
      </div>

      {isLoading && !insights ? (
        <div className="px-3 pt-3 flex flex-col gap-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <div className="pb-6">
          {/* Spend summary card */}
          {summary && (
            <div className="px-3 pt-3">
              <SpendCard insights={insights} loading={false} />
            </div>
          )}

          {/* Stat chips row */}
          {summary && (
            <div className="flex gap-2 px-3 mt-3">
              <StatChip
                label="Spent"
                value={formatINR(summary.thisWeekTotal ?? 0)}
                trend={summary.changePercent}
              />
              <StatChip
                label="vs Last"
                value={formatINR(summary.lastWeekTotal ?? 0)}
              />
              <StatChip
                label="Top"
                value={getCategoryMeta(summary.topCategory ?? 'other').emoji}
              />
            </div>
          )}

          {/* Anomaly alerts */}
          <AnimatePresence>
            {anomalies.map((a) => (
              <motion.div
                key={a.category}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-3 mt-3"
              >
                <AnomalyAlert
                  anomaly={a}
                  onDismiss={() => setDismissed((d) => [...d, a.category])}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Category breakdown */}
          {categories.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="bg-white mx-3 mt-3 rounded-2xl shadow-card overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-[14px] font-[700] text-ink">Category Breakdown</p>
                <p className="text-[11px] text-ink-3 mt-0.5">
                  {period === 'week' ? 'This week' : 'This month'}'s spend by category
                </p>
              </div>
              <div className="px-4 py-1 divide-y divide-gray-50">
                {categories.map((c, i) => (
                  <CategoryBar
                    key={c.category}
                    category={c.category}
                    amountPaise={c.amountPaise}
                    totalPaise={totalPaise}
                    rank={i}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* AI Insight message */}
          {insights?.insight?.message && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14 }}
              className="mx-3 mt-3 bg-white rounded-2xl shadow-card overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                <Shield size={14} className="text-paytm-blue" />
                <p className="text-[13px] font-[700] text-ink">Guardian AI Insight</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[13px] text-ink-2 leading-relaxed">
                  🤖 {insights.insight.message}
                </p>
                {insights.insight.generatedAt && (
                  <p className="text-[10px] text-ink-4 mt-2">
                    Generated {new Date(insights.insight.generatedAt).toLocaleTimeString('en-IN', {
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* Empty state */}
          {!isLoading && !summary && (
            <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <TrendingUp size={28} className="text-ink-3" />
              </div>
              <p className="text-[15px] font-[700] text-ink mb-2">No Data Yet</p>
              <p className="text-[13px] text-ink-3 leading-relaxed">
                Make some transactions and come back to see your spend intelligence.
              </p>
            </div>
          )}

          {/* Guardian badge */}
          <div className="flex items-center justify-center gap-2 mt-4 mb-2">
            <Shield size={12} className="text-ink-4" />
            <p className="text-[10px] text-ink-4 font-[500]">
              Powered by PaySense Guardian · RBI FREE-AI compliant
            </p>
          </div>
        </div>
      )}
    </PaytmShell>
  );
}