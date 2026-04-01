import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Filter, Download, ChevronRight,
  CheckCircle2, XCircle, Clock, ShieldAlert
} from 'lucide-react';
import PaytmShell from '@/components/layout/PaytmShell';
import { TxRowSkeleton } from '@/components/ui/Skeleton';
import api from '@/services/api';
import {
  formatINR, formatTxDate, formatMonthYear,
  getCategoryMeta, getInitials, getAvatarColor, cx
} from '@/utils/helpers';

// ── Account Balance Card (top strip) ────────────────────────────────────────
function AccountCard({ name, account, active }) {
  return (
    <div className={cx(
      'flex-shrink-0 w-40 rounded-2xl p-3 border-2 transition-all',
      active ? 'border-paytm-blue bg-paytm-navy text-white' : 'border-gray-100 bg-white text-ink'
    )}>
      <div className="flex items-start justify-between mb-2">
        <p className={cx('text-[12px] font-[700]', active ? 'text-white' : 'text-ink')}>{name}</p>
        {active && (
          <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
            <CheckCircle2 size={12} color="white" />
          </div>
        )}
      </div>
      <p className={cx('text-[10px] mb-3', active ? 'text-blue-200' : 'text-ink-3')}>{account}</p>
      <button className={cx(
        'w-full text-[11px] font-[600] py-1.5 rounded-xl',
        active ? 'bg-white/20 text-white border border-white/30' : 'bg-gray-100 text-ink-2'
      )}>
        Check Balance
      </button>
    </div>
  );
}

// ── Transaction row ──────────────────────────────────────────────────────────
function TxRow({ tx, onClick }) {
  const meta = getCategoryMeta(tx.category);
  const { bg, text } = getAvatarColor(tx.payeeName || tx.payeeUpi);
  const initials = tx.payeeName
    ? getInitials(tx.payeeName)
    : tx.payeeUpi.slice(0, 2).toUpperCase();

  const statusConfig = {
    SUCCESS: { color: 'text-ink', prefix: '- ', icon: null },
    FAILED:  { color: 'text-danger', prefix: '', icon: <XCircle size={12} className="text-danger" /> },
    PENDING: { color: 'text-warning', prefix: '', icon: <Clock size={12} className="text-warning" /> },
    BLOCKED: { color: 'text-danger', prefix: '', icon: <ShieldAlert size={12} className="text-danger" /> },
  };
  const s = statusConfig[tx.status] || statusConfig.SUCCESS;

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="tx-row w-full text-left"
    >
      {/* Avatar */}
      <div className="avatar w-10 h-10 text-[13px] font-[700] flex-shrink-0" style={{ background: bg, color: text }}>
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-[600] text-ink truncate">
          {tx.payeeName || tx.payeeUpi}
        </p>
        <p className="text-[11px] text-ink-3">
          {formatTxDate(tx.createdAt)}
        </p>
        {tx.category && tx.category !== 'other' && (
          <span className="category-chip mt-1">
            {meta.emoji} {meta.label}
          </span>
        )}
      </div>

      {/* Amount + status */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className={cx('text-[14px] font-[700]', s.color)}>
          {tx.status === 'FAILED' ? (
            <span className="text-danger">Failed</span>
          ) : (
            `${s.prefix}${formatINR(tx.amountRupees || tx.amountPaise / 100)}`
          )}
        </span>
        {s.icon && (
          <div className="flex items-center gap-1 text-[10px] font-[600] text-danger">
            {s.icon}
            <span>{tx.status}</span>
          </div>
        )}
        {tx.riskDecision === 'WARN' && (
          <ShieldAlert size={12} className="text-warning" />
        )}
      </div>
    </motion.button>
  );
}

export default function History() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);

  const fetchTxs = useCallback(async (p = 1) => {
    try {
      setLoading(true);
      const res = await api.get(`/transactions?page=${p}&limit=20`);
      const { transactions: txs, pagination } = res.data;
      setTransactions(prev => p === 1 ? txs : [...prev, ...txs]);
      setHasMore(p < pagination.pages);
      setTotal(pagination.total);
      setPage(p);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTxs(1); }, []);

  // Group transactions by month
  const grouped = transactions.reduce((acc, tx) => {
    const key = formatMonthYear(tx.createdAt);
    if (!acc[key]) acc[key] = { label: key, txs: [], total: 0 };
    acc[key].txs.push(tx);
    if (tx.status === 'SUCCESS') {
      acc[key].total += tx.amountRupees || tx.amountPaise / 100;
    }
    return acc;
  }, {});

  const totalSpent = transactions
    .filter(t => t.status === 'SUCCESS')
    .reduce((s, t) => s + (t.amountRupees || t.amountPaise / 100), 0);

  return (
    <PaytmShell
      title="Balance & History"
      showBack
      topBarRight={
        <div className="flex gap-1">
          <button className="p-2 ripple rounded-full" onClick={() => setSearchOpen(!searchOpen)}>
            <Search size={18} className="text-ink-2" />
          </button>
          <button className="p-2 ripple rounded-full">
            <Filter size={18} className="text-ink-2" />
          </button>
          <button className="p-2 ripple rounded-full">
            <Download size={18} className="text-ink-2" />
          </button>
        </div>
      }
    >
      {/* ── Account cards row ─────────────────────────────────────────── */}
      <div className="bg-paytm-blue-light pt-4 pb-5 px-4">
        <p className="text-[13px] font-[700] text-paytm-navy mb-3">Your Accounts</p>
        <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          <AccountCard name="Yes Bank" account="A/c No: 1136" active={true} />
          <AccountCard name="UPI Lite" account="2x Gold Coins on all payments" active={false} />
          <div className="flex-shrink-0 w-32 rounded-2xl border-2 border-dashed border-blue-200 p-3 flex flex-col items-center justify-center gap-1 cursor-pointer">
            <div className="w-7 h-7 rounded-full bg-paytm-blue flex items-center justify-center">
              <span className="text-white text-base font-bold">+</span>
            </div>
            <p className="text-[10px] text-paytm-blue font-[600] text-center leading-tight">
              Add Paytm Postpaid
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white pt-1">
        {/* ── Payment History header ─────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <p className="text-[16px] font-[700] text-ink">Payment History</p>
          <p className="text-[12px] text-ink-3">{total} transactions</p>
        </div>

        {/* ── Groups ────────────────────────────────────────────────── */}
        {loading && page === 1 ? (
          <div>
            {Array.from({ length: 8 }).map((_, i) => <TxRowSkeleton key={i} />)}
          </div>
        ) : (
          Object.entries(grouped).map(([monthKey, group]) => (
            <div key={monthKey}>
              {/* Month header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 sticky top-0 z-10">
                <span className="text-[13px] font-[700] text-ink">{group.label}</span>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-ink-3">Total Spent</span>
                  <button className="flex items-center gap-1">
                    <span className="text-[14px] font-[700] text-paytm-blue">
                      {formatINR(group.total, { showPaise: true })}
                    </span>
                    <ChevronRight size={14} className="text-paytm-blue" />
                  </button>
                </div>
              </div>

              {/* Transaction rows */}
              {group.txs.map((tx, i) => (
                <TxRow
                  key={tx.txId || i}
                  tx={tx}
                  onClick={() => navigate(`/transaction/${tx.txId}`)}
                />
              ))}
            </div>
          ))
        )}

        {/* Load more */}
        {hasMore && !loading && (
          <button
            onClick={() => fetchTxs(page + 1)}
            className="w-full py-4 text-paytm-blue text-[13px] font-[600]"
          >
            Load more transactions
          </button>
        )}

        {loading && page > 1 && (
          <div className="py-4">
            {Array.from({ length: 3 }).map((_, i) => <TxRowSkeleton key={i} />)}
          </div>
        )}

        {!loading && transactions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Clock size={28} className="text-ink-3" />
            </div>
            <p className="text-[15px] font-[600] text-ink mb-2">No Transactions Yet</p>
            <p className="text-[13px] text-ink-3">Your payment history will appear here.</p>
          </div>
        )}

        {/* Paytm footer */}
        <div className="flex items-center justify-center gap-2 py-6 border-t border-gray-100 mt-2">
          <span className="text-[11px] font-[700] text-ink">paytm</span>
          <span className="text-ink-4 text-[10px]">|</span>
          <span className="text-[10px] text-ink-3">Powered by</span>
          <div className="flex items-center gap-0.5">
            <span className="font-[800] text-xs" style={{ color: '#FF6B00' }}>U</span>
            <span className="font-[800] text-xs" style={{ color: '#009900' }}>P</span>
            <span className="font-[800] text-xs" style={{ color: '#002B6E' }}>I</span>
          </div>
        </div>
      </div>
    </PaytmShell>
  );
}