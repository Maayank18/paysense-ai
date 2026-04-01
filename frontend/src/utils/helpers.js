import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { clsx } from 'clsx';

// ─────────────────────────────────────────────────────────────────────────────
// Currency formatting — always in ₹
// ─────────────────────────────────────────────────────────────────────────────
export const formatINR = (amount, opts = {}) => {
  const num = typeof amount === 'number' ? amount : Number(amount) || 0;
  const { compact = false, showPaise = false } = opts;

  if (compact) {
    if (num >= 10_000_000) return `₹${(num / 10_000_000).toFixed(1)} Cr`;
    if (num >= 100_000)    return `₹${(num / 100_000).toFixed(1)} L`;
    if (num >= 1_000)      return `₹${(num / 1_000).toFixed(1)}K`;
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: showPaise ? 2 : 0,
    maximumFractionDigits: showPaise ? 2 : 0,
  }).format(num);
};

// ─────────────────────────────────────────────────────────────────────────────
// Date formatting — Paytm style ("Today, 3:45 PM" / "29 Mar, 8:27 PM")
// ─────────────────────────────────────────────────────────────────────────────
export const formatTxDate = (dateStr) => {
  const date = new Date(dateStr);
  const timeStr = format(date, 'h:mm aa').replace('AM', 'AM').replace('PM', 'PM');

  if (isToday(date)) return `Today, ${timeStr}`;
  if (isYesterday(date)) return `Yesterday, ${timeStr}`;
  return `${format(date, 'd MMM')}, ${timeStr}`;
};

export const formatRelativeDate = (dateStr) => {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
};

export const formatMonthYear = (dateStr) => format(new Date(dateStr), 'MMMM yyyy');

// ─────────────────────────────────────────────────────────────────────────────
// Avatar color generator — deterministic from name/string
// ─────────────────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  { bg: '#FFE4E8', text: '#C2185B' }, // pink
  { bg: '#E3F2FD', text: '#1565C0' }, // blue
  { bg: '#E8F5E9', text: '#2E7D32' }, // green
  { bg: '#FFF3E0', text: '#E65100' }, // orange
  { bg: '#F3E5F5', text: '#7B1FA2' }, // purple
  { bg: '#E1F5FE', text: '#0277BD' }, // light blue
  { bg: '#FCE4EC', text: '#AD1457' }, // deep pink
  { bg: '#E8EAF6', text: '#283593' }, // indigo
];

export const getAvatarColor = (name = '') => {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
};

export const getInitials = (name = '') => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

// ─────────────────────────────────────────────────────────────────────────────
// Category metadata — icon emoji + label + color
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORY_META = {
  food_delivery:   { emoji: '🍔', label: 'Food',        color: '#FF6B35' },
  grocery:         { emoji: '🛒', label: 'Grocery',     color: '#43A047' },
  utilities:       { emoji: '⚡', label: 'Utilities',   color: '#FFA726' },
  mobile_recharge: { emoji: '📱', label: 'Recharge',    color: '#42A5F5' },
  transit:         { emoji: '🚗', label: 'Travel',      color: '#66BB6A' },
  entertainment:   { emoji: '🎬', label: 'Movies',      color: '#AB47BC' },
  shopping:        { emoji: '🛍️', label: 'Shopping',   color: '#EC407A' },
  fuel:            { emoji: '⛽', label: 'Fuel',         color: '#FF7043' },
  health:          { emoji: '❤️', label: 'Health',      color: '#EF5350' },
  education:       { emoji: '📚', label: 'Education',   color: '#5C6BC0' },
  p2p_transfer:    { emoji: '💸', label: 'Transfer',    color: '#26A69A' },
  merchant_pos:    { emoji: '🏪', label: 'Merchant',    color: '#8D6E63' },
  emi_payment:     { emoji: '🏦', label: 'EMI',         color: '#78909C' },
  insurance:       { emoji: '🛡️', label: 'Insurance',  color: '#5E35B1' },
  investment:      { emoji: '📈', label: 'Investment',  color: '#00897B' },
  other:           { emoji: '💼', label: 'Other',       color: '#90A4AE' },
};

export const getCategoryMeta = (category) =>
  CATEGORY_META[category] || CATEGORY_META.other;

// ─────────────────────────────────────────────────────────────────────────────
// Risk decision styling
// ─────────────────────────────────────────────────────────────────────────────
export const getRiskStyle = (decision) => {
  switch (decision) {
    case 'BLOCK': return { bg: '#FFF0F0', border: '#FF3D3D', text: '#CC0000', icon: '🚫' };
    case 'WARN':  return { bg: '#FFF3E0', border: '#FF8C00', text: '#CC6600', icon: '⚠️' };
    default:      return { bg: '#F0FFF4', border: '#00C853', text: '#007A2F', icon: '✅' };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ScoreUp level styling
// ─────────────────────────────────────────────────────────────────────────────
export const getScoreLevel = (score) => {
  if (score >= 80) return { level: 'GOLD',   color: '#F5C842', label: 'Excellent', emoji: '🥇' };
  if (score >= 55) return { level: 'SILVER', color: '#A8B4C0', label: 'Good',      emoji: '🥈' };
  return             { level: 'BRONZE', color: '#CD7F32', label: 'Fair',      emoji: '🥉' };
};

// ─────────────────────────────────────────────────────────────────────────────
// clsx re-export for convenience
// ─────────────────────────────────────────────────────────────────────────────
export { clsx as cx };

// ─────────────────────────────────────────────────────────────────────────────
// Truncate UPI ID for display
// ─────────────────────────────────────────────────────────────────────────────
export const truncateUpiId = (upiId = '', maxLen = 20) => {
  if (upiId.length <= maxLen) return upiId;
  const [local, domain] = upiId.split('@');
  if (!domain) return upiId.slice(0, maxLen) + '…';
  const localTrunc = local.slice(0, maxLen - domain.length - 4) + '…';
  return `${localTrunc}@${domain}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Haptic feedback (mobile)
// ─────────────────────────────────────────────────────────────────────────────
export const haptic = (type = 'light') => {
  if ('vibrate' in navigator) {
    const patterns = { light: [10], medium: [20], heavy: [30, 10, 30] };
    navigator.vibrate(patterns[type] || [10]);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Delay helper
// ─────────────────────────────────────────────────────────────────────────────
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));