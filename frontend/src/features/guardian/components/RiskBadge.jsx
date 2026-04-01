import { motion } from 'framer-motion';
import { ShieldCheck, ShieldAlert, ShieldOff } from 'lucide-react';
import { cx } from '@/utils/helpers';

const CFG = {
  ALLOW: { Icon: ShieldCheck, bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-500', bar: '#00C853', label: 'Safe' },
  WARN:  { Icon: ShieldAlert, bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-400', bar: '#FF8C00', label: 'Caution' },
  BLOCK: { Icon: ShieldOff,   bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    dot: 'bg-red-500',    bar: '#FF3D3D', label: 'High Risk' },
};

export default function RiskBadge({ decision = 'ALLOW', score = 0, size = 'sm', showScore = false, showIcon = false }) {
  const cfg = CFG[decision] || CFG.ALLOW;
  const isLg = size === 'lg';
  return (
    <div className={cx('inline-flex items-center gap-1.5 rounded-full border font-[600] select-none', cfg.bg, cfg.border, cfg.text, isLg ? 'px-3 py-1.5 text-sm gap-2' : 'px-2.5 py-1 text-xs')}>
      {showIcon ? <cfg.Icon size={isLg ? 14 : 11} /> : (
        <motion.span className={cx('rounded-full flex-shrink-0', cfg.dot, decision !== 'ALLOW' && 'animate-pulse')} style={{ width: isLg ? 8 : 6, height: isLg ? 8 : 6 }} />
      )}
      {cfg.label}
      {showScore && <span className="font-mono opacity-70 ml-0.5">{score}</span>}
    </div>
  );
}

export function RiskBar({ score = 0, className = '' }) {
  const color = score > 75 ? '#FF3D3D' : score > 40 ? '#FF8C00' : '#00C853';
  return (
    <div className={cx('w-full h-2 bg-gray-100 rounded-full overflow-hidden', className)}>
      <motion.div className="h-full rounded-full" style={{ backgroundColor: color }} initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.7, ease: 'easeOut' }} />
    </div>
  );
}

export function ScoreChip({ score = 0 }) {
  const c = score > 75 ? { bg: '#FFF0F0', text: '#CC0000' } : score > 40 ? { bg: '#FFF3E0', text: '#CC6600' } : { bg: '#F0FFF4', text: '#007A2F' };
  return <span className="text-[10px] font-[700] font-mono rounded px-1.5 py-0.5" style={{ background: c.bg, color: c.text }}>{score}</span>;
}