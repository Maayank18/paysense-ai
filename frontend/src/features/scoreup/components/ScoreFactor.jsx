import { motion } from 'framer-motion';

/**
 * ScoreFactor
 * Single credit-factor row: label | bar | value/max
 *
 * Props:
 *   label   – display string (can include emoji)
 *   value   – current points earned
 *   max     – maximum possible points for this factor
 *   delay   – framer-motion animation stagger delay (seconds)
 */
export default function ScoreFactor({ label, value = 0, max = 100, delay = 0 }) {
  const pct   = max > 0 ? Math.round((value / max) * 100) : 0;
  const color =
    pct >= 70 ? '#00C853'
    : pct >= 40 ? '#FF8C00'
    : '#FF3D3D';

  return (
    <div>
      {/* Label row */}
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[12px] font-[500] text-ink-2 leading-tight">{label}</span>
        <div className="flex items-center gap-1.5">
          <span
            className="text-[13px] font-[800] tabular-nums"
            style={{ color }}
          >
            {value}
          </span>
          <span className="text-[10px] text-ink-4">/ {max}</span>
        </div>
      </div>

      {/* Progress track */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.85, delay, ease: [0.4, 0, 0.2, 1] }}
        />
      </div>
    </div>
  );
}