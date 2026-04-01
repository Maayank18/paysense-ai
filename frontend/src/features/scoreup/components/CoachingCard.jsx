import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * CoachingCard
 * Renders the Groq-generated coaching nudge from ScoreUp's coachingEngine.
 *
 * Props:
 *   coaching – { message, urgency, cta: { label, action }, event }
 */
export default function CoachingCard({ coaching }) {
  const navigate = useNavigate();
  if (!coaching?.message) return null;

  const isUrgent = coaching.urgency === 'HIGH';

  const handleCta = () => {
    const action = coaching.cta?.action;
    if (action === 'OPEN_POSTPAID' || action === 'OPEN_LIMIT') navigate('/pay');
    else navigate('/scoreup');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-4 border ${
        isUrgent
          ? 'bg-orange-50 border-orange-200'
          : 'bg-blue-50  border-blue-100'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isUrgent ? 'bg-orange-100' : 'bg-blue-100'
          }`}
        >
          <Sparkles
            size={16}
            className={isUrgent ? 'text-warning' : 'text-paytm-blue'}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-[10px] font-[700] uppercase tracking-widest mb-1 ${
              isUrgent ? 'text-orange-600' : 'text-paytm-blue'
            }`}
          >
            AI Coaching
          </p>

          <p className="text-[13px] font-[500] text-ink leading-relaxed">
            {coaching.message}
          </p>

          {coaching.cta?.label && (
            <button
              onClick={handleCta}
              className={`mt-2.5 flex items-center gap-1 text-[12px] font-[700] ${
                isUrgent ? 'text-orange-700' : 'text-paytm-blue'
              }`}
            >
              {coaching.cta.label}
              <ArrowRight size={12} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}