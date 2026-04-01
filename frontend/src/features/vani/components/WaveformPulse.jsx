import { motion } from 'framer-motion';

const BAR_HEIGHTS = [0.3, 0.6, 1.0, 0.7, 0.4, 0.8, 0.5, 1.0, 0.6, 0.3, 0.7, 0.9, 0.4, 0.6, 0.8];

export default function WaveformPulse({ isActive = true, color = '#00BAF2', barCount = 15 }) {
  const bars = BAR_HEIGHTS.slice(0, barCount);

  return (
    <div className="flex items-center justify-center gap-[3px]" style={{ height: 48 }}>
      {bars.map((baseHeight, i) => (
        <motion.div
          key={i}
          className="rounded-full flex-shrink-0"
          style={{
            width: 3,
            backgroundColor: color,
            opacity: isActive ? 1 : 0.3,
          }}
          animate={isActive ? {
            height: [`${baseHeight * 12}px`, `${baseHeight * 44}px`, `${baseHeight * 12}px`],
          } : {
            height: '6px',
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.05,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

/** Static waveform (while processing) */
export function WaveformIdle({ color = '#00BAF2BB' }) {
  return (
    <div className="flex items-center justify-center gap-[3px]" style={{ height: 32 }}>
      {[4, 8, 6, 12, 8, 6, 10, 6, 8, 4].map((h, i) => (
        <div
          key={i}
          className="rounded-full flex-shrink-0"
          style={{ width: 3, height: h, backgroundColor: color }}
        />
      ))}
    </div>
  );
}