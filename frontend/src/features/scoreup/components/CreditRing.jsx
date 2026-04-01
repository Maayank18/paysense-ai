import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { getScoreLevel } from '@/utils/helpers';

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function CreditRing({ score = 0, size = 140, animate = true }) {
  const [displayScore, setDisplayScore] = useState(0);
  const { color, label, emoji } = getScoreLevel(score);

  const strokeDashoffset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
  const center = size / 2;
  const scale = size / 120;

  // Animate counter
  useEffect(() => {
    if (!animate) { setDisplayScore(score); return; }
    let frame;
    let start = null;
    const duration = 1400;
    const from = 0;
    const to = score;

    const step = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setDisplayScore(Math.round(from + (to - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    const timeout = setTimeout(() => { frame = requestAnimationFrame(step); }, 300);
    return () => { clearTimeout(timeout); cancelAnimationFrame(frame); };
  }, [score, animate]);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle
          cx={center} cy={center} r={RADIUS * scale}
          fill="none" stroke="#F0F0F5" strokeWidth={10 * scale}
        />
        {/* Progress */}
        <motion.circle
          cx={center} cy={center} r={RADIUS * scale}
          fill="none"
          stroke={color}
          strokeWidth={10 * scale}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE * scale}
          initial={{ strokeDashoffset: CIRCUMFERENCE * scale }}
          animate={{ strokeDashoffset: strokeDashoffset * scale }}
          transition={{ duration: 1.4, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
          style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
        />
      </svg>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center">
        <motion.span
          className="font-[800] leading-none tabular-nums"
          style={{ fontSize: size * 0.27, color }}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          {displayScore}
        </motion.span>
        <motion.span
          className="text-ink-3 font-[500] mt-0.5"
          style={{ fontSize: size * 0.09 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          {label} {emoji}
        </motion.span>
      </div>
    </div>
  );
}