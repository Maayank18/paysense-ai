import { motion } from 'framer-motion';
import { AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * EMIAlert
 * Renders the 7-day EMI failure prediction from emiPredictor.js.
 *
 * Props:
 *   emiAlert – { alert, riskLevel, daysUntilDue, nextEmiAmountRupees,
 *                shortfallRupees, message }
 */
export default function EMIAlert({ emiAlert }) {
  const navigate = useNavigate();
  if (!emiAlert?.alert) return null;

  const { riskLevel, daysUntilDue, nextEmiAmountRupees, shortfallRupees, message } = emiAlert;

  const isCritical = riskLevel === 'CRITICAL' || riskLevel === 'OVERDUE';
  const isOverdue  = riskLevel === 'OVERDUE';

  const palette = isCritical
    ? { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-danger', btn: 'text-danger', badge: 'bg-red-100 text-danger' }
    : { bg: 'bg-orange-50', border: 'border-orange-200', icon: 'text-warning', btn: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-4 border ${palette.bg} ${palette.border}`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${palette.badge}`}>
          <AlertTriangle size={17} />
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className={`text-[13px] font-[700] ${isCritical ? 'text-danger' : 'text-warning'}`}>
              {isOverdue ? 'EMI Overdue' : `EMI Due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`}
            </p>
            {isCritical && (
              <span className={`text-[9px] font-[700] rounded-full px-2 py-0.5 uppercase ${palette.badge}`}>
                {isOverdue ? 'Overdue' : 'Urgent'}
              </span>
            )}
          </div>

          {message ? (
            <p className="text-[12px] text-ink-2 leading-relaxed mb-2">{message}</p>
          ) : (
            <p className="text-[12px] text-ink-2 mb-2">
              ₹{nextEmiAmountRupees} {isOverdue ? 'was due' : 'due soon'}
            </p>
          )}

          {shortfallRupees > 0 && (
            <p className="text-[11px] text-ink-3 mb-2">
              Projected shortfall:{' '}
              <strong className="text-danger">₹{shortfallRupees}</strong>
            </p>
          )}

          <button
            onClick={() => navigate('/pay')}
            className={`flex items-center gap-1 text-[12px] font-[700] ${palette.btn}`}
          >
            Pay Now <ArrowRight size={12} />
          </button>
        </div>

        {/* Amount */}
        <div className="flex-shrink-0 text-right">
          <p className="text-[17px] font-[800] text-ink">₹{nextEmiAmountRupees}</p>
          <div className="flex items-center gap-1 justify-end mt-0.5">
            <Clock size={9} className="text-ink-3" />
            <p className="text-[10px] text-ink-3">
              {isOverdue ? 'overdue' : `${daysUntilDue}d left`}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}