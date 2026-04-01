import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, X, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getCategoryMeta, formatINR, cx } from '@/utils/helpers';

/**
 * AnomalyAlert — inline banner shown on Home/Insights when
 * Guardian detects an unusual spend pattern.
 * Dismissable, navigates to /insights on tap.
 */
export default function AnomalyAlert({ anomaly, onDismiss }) {
  const navigate = useNavigate();
  if (!anomaly) return null;

  const meta = getCategoryMeta(anomaly.category);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.97 }}
        transition={{ type: 'spring', damping: 26, stiffness: 380 }}
        className="mx-3 mb-3"
      >
        <button
          onClick={() => navigate('/insights')}
          className="w-full text-left rounded-2xl overflow-hidden shadow-card"
          style={{ border: '1.5px solid #FFD180' }}
        >
          {/* Orange top strip */}
          <div className="h-1 w-full bg-gradient-to-r from-orange-400 to-yellow-400" />

          <div className="bg-orange-50 px-4 py-3 flex items-center gap-3">
            {/* Icon */}
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ background: meta.color + '22' }}
            >
              {meta.emoji}
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <TrendingUp size={12} className="text-orange-500" />
                <span className="text-[11px] font-[700] text-orange-600 uppercase tracking-wide">
                  Spend Anomaly
                </span>
              </div>
              <p className="text-[13px] font-[600] text-ink truncate">
                {meta.label} up {anomaly.changePercent}% this week
              </p>
              <p className="text-[11px] text-ink-3">
                {formatINR(anomaly.thisWeekRupees)} vs avg{' '}
                {formatINR(anomaly.weeklyAvgRupees)}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <ArrowRight size={16} className="text-orange-400" />
              {onDismiss && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                  className="p-1 rounded-full hover:bg-orange-100 active:bg-orange-200 transition-colors"
                >
                  <X size={14} className="text-orange-400" />
                </button>
              )}
            </div>
          </div>
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * AnomalyBadge — tiny inline chip for transaction rows
 */
export function AnomalyBadge({ label = 'High Spend' }) {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-[700] bg-orange-50 text-orange-600 rounded-full px-2 py-0.5 border border-orange-200">
      <TrendingUp size={8} />
      {label}
    </span>
  );
}