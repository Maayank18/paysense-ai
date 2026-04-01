import { motion } from 'framer-motion';

/**
 * StreakBadge
 * Displays on-time payment streak with a dancing flame animation.
 *
 * Props:
 *   streak – number of consecutive on-time payments
 *   points – total gamification points earned
 */
export default function StreakBadge({ streak, points }) {
  if (!streak || streak <= 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Streak pill */}
      <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-full px-3 py-1.5">
        <motion.span
          className="text-base leading-none"
          animate={{ rotate: [-8, 8, -8], scale: [1, 1.12, 1] }}
          transition={{ duration: 0.65, repeat: Infinity, repeatDelay: 2.5 }}
        >
          🔥
        </motion.span>
        <span className="text-[12px] font-[700] text-orange-700">
          {streak}&nbsp;{streak === 1 ? 'payment' : 'payments'} on time
        </span>
      </div>

      {/* Points pill */}
      {points > 0 && (
        <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 rounded-full px-3 py-1.5">
          <span className="text-sm leading-none">⭐</span>
          <span className="text-[12px] font-[700] text-yellow-700">
            {points} pts
          </span>
        </div>
      )}
    </div>
  );
}