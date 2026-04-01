import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatINR, getCategoryMeta, cx } from '@/utils/helpers';

export default function SpendCard({ insights, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-card animate-pulse">
        <div className="h-3 bg-gray-100 rounded w-1/3 mb-3" />
        <div className="h-8 bg-gray-100 rounded w-1/2 mb-3" />
        <div className="h-3 bg-gray-100 rounded w-3/4" />
      </div>
    );
  }

  if (!insights?.summary) return null;

  const { thisWeekTotal, changePercent, topCategory } = insights.summary;
  const meta = getCategoryMeta(topCategory);
  const isUp = changePercent > 0;
  const isFlat = changePercent === 0;

  return (
    <div className="bg-white rounded-2xl shadow-card overflow-hidden">
      {/* Top gradient strip */}
      <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #00BAF2, #0098CC)' }} />

      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[11px] text-ink-3 font-[600] uppercase tracking-wide mb-1">
              This Week
            </p>
            <motion.p
              className="text-[24px] font-[800] text-ink leading-tight"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {formatINR(thisWeekTotal)}
            </motion.p>
          </div>
          {/* Change indicator */}
          <div className={cx(
            'flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-[700]',
            isFlat ? 'bg-gray-100 text-ink-3' :
            isUp ? 'bg-red-50 text-danger' : 'bg-green-50 text-success'
          )}>
            {isFlat ? <Minus size={12} /> : isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {isFlat ? '0%' : `${Math.abs(changePercent)}%`}
          </div>
        </div>

        {/* AI insight message */}
        {insights.insight?.message && (
          <div className="rounded-xl p-3 bg-paytm-blue-light mb-3">
            <p className="text-[12px] text-paytm-blue-dark leading-relaxed font-[500]">
              {insights.insight.message}
            </p>
          </div>
        )}

        {/* Top category */}
        <div className="flex items-center gap-2">
          <span className="text-lg">{meta.emoji}</span>
          <div>
            <p className="text-[11px] text-ink-3">Top category</p>
            <p className="text-[12px] font-[600] text-ink">{meta.label}</p>
          </div>
        </div>
      </div>
    </div>
  );
}