import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, ShieldOff, Eye, EyeOff } from 'lucide-react';
import { guardianApi } from '../guardian.api';
import { toast }        from '@/components/ui/Toast';
import { haptic }       from '@/utils/helpers';

const SCENARIOS = [
  { key:'phishing', label:'Phishing Attack',     sublabel:'KYC scam → ₹25,000',   color:'#FF3D3D', bg:'rgba(255,61,61,0.10)',   border:'rgba(255,61,61,0.30)',   emoji:'🎣', expected:'BLOCK' },
  { key:'social',   label:'Social Engineering',  sublabel:'Prize scam → ₹10,000',  color:'#CC0080', bg:'rgba(204,0,128,0.08)',   border:'rgba(204,0,128,0.25)',   emoji:'🎭', expected:'BLOCK' },
  { key:'amount',   label:'Amount Anomaly',       sublabel:'₹75,000 vs avg ₹450',  color:'#FF8C00', bg:'rgba(255,140,0,0.10)',   border:'rgba(255,140,0,0.30)',   emoji:'📊', expected:'BLOCK' },
  { key:'device',   label:'Account Takeover',     sublabel:'New device → ₹50,000', color:'#8B0000', bg:'rgba(139,0,0,0.10)',     border:'rgba(139,0,0,0.25)',     emoji:'🔓', expected:'WARN'  },
  { key:'velocity', label:'Velocity Fraud',        sublabel:'Rapid transactions',   color:'#FF6600', bg:'rgba(255,102,0,0.10)',   border:'rgba(255,102,0,0.30)',   emoji:'⚡', expected:'BLOCK' },
  { key:'temporal', label:'Late Night Txn',        sublabel:'2 AM unknown payee',   color:'#6B48FF', bg:'rgba(107,72,255,0.10)', border:'rgba(107,72,255,0.30)', emoji:'🌙', expected:'WARN'  },
];

function ScenarioButton({ scenario, onFire, loading, lastResult }) {
  const isLoading = loading === scenario.key;
  const result    = lastResult?.key === scenario.key ? lastResult : null;

  return (
    <motion.button
      onClick={() => onFire(scenario.key)}
      disabled={!!loading}
      whileTap={!loading ? { scale: 0.93 } : {}}
      className="relative flex items-start gap-2.5 p-3 rounded-xl text-left disabled:opacity-60 transition-opacity"
      style={{ background: scenario.bg, border: `1px solid ${scenario.border}` }}
    >
      <span className="text-xl leading-none flex-shrink-0 mt-0.5">{scenario.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-[700] leading-tight" style={{ color: scenario.color }}>
          {scenario.label}
        </p>
        <p className="text-[10px] text-ink-3 mt-0.5">{scenario.sublabel}</p>
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 mt-1.5"
            >
              <ShieldOff size={10} style={{ color: scenario.color }} />
              <span className="text-[10px] font-[700]" style={{ color: scenario.color }}>{result.decision}</span>
              <Clock size={9} className="text-ink-4" />
              <span className="text-[10px] font-mono text-ink-4">{result.latencyMs}ms</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* FIX 3: CSS-only spinner avoids framer-motion double-animate bug */}
      {isLoading && (
        <span
          className="absolute top-2 right-2 w-4 h-4 rounded-full"
          style={{
            border: `2px solid ${scenario.color}44`,
            borderTopColor: scenario.color,
            animation: 'psDemoSpin 0.7s linear infinite',
          }}
        />
      )}
      {!result && !isLoading && (
        <span
          className="absolute top-2 right-2 text-[8px] font-[700] rounded px-1.5 py-0.5"
          style={{
            color:      scenario.expected === 'BLOCK' ? '#FF3D3D' : '#FF8C00',
            background: scenario.expected === 'BLOCK' ? 'rgba(255,61,61,0.12)' : 'rgba(255,140,0,0.12)',
          }}
        >
          {scenario.expected}
        </span>
      )}
    </motion.button>
  );
}

export default function DemoScenarioPanel() {
  const [loading,     setLoading]     = useState(null);
  const [lastResults, setLastResults] = useState({});
  const [visible,     setVisible]     = useState(true);

  const fireDemoScenario = useCallback(async (scenarioKey) => {
    if (loading) return;
    haptic('medium');
    setLoading(scenarioKey);
    const startMs = Date.now();
    try {
      const raw    = await guardianApi.triggerDemoScenario(scenarioKey);
      const result = raw?.data ?? raw;
      setLastResults((prev) => ({
        ...prev,
        [scenarioKey]: { key: scenarioKey, decision: result.decision ?? result.riskDecision, latencyMs: Date.now() - startMs },
      }));
      const s = SCENARIOS.find((sc) => sc.key === scenarioKey);
      toast.warn(`${s?.emoji} "${s?.label}" fired — watch the alert!`, 3000);
    } catch (err) {
      console.error('[DemoPanel]', err?.message);
      toast.error('Scenario failed. Is the backend running?');
    } finally {
      setLoading(null);
    }
  }, [loading]);

  return (
    <>
      <style>{`@keyframes psDemoSpin { to { transform: rotate(360deg); } }`}</style>
      <div className="rounded-2xl overflow-hidden" style={{ border:'1.5px solid rgba(255,61,61,0.25)', background:'rgba(20,0,0,0.03)' }}>
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background:'rgba(255,61,61,0.06)', borderBottom:'1px solid rgba(255,61,61,0.15)' }}
        >
          <div className="flex items-center gap-2">
            <motion.div className="w-2 h-2 rounded-full bg-red-500" animate={{ opacity:[1,0.3,1] }} transition={{ duration:1.2, repeat:Infinity }} />
            <span className="text-[13px] font-[700] text-danger">Demo Control Panel</span>
            <span className="text-[10px] text-ink-4 font-mono">dev only</span>
          </div>
          <button onClick={() => setVisible((v) => !v)} className="p-1 text-ink-3">
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <AnimatePresence>
          {visible && (
            <motion.div
              initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }}
              exit={{ height:0, opacity:0 }} transition={{ duration:0.22 }}
              className="overflow-hidden"
            >
              <div className="p-3 grid grid-cols-2 gap-2">
                {SCENARIOS.map((s) => (
                  <ScenarioButton key={s.key} scenario={s} onFire={fireDemoScenario} loading={loading} lastResult={lastResults[s.key] ?? null} />
                ))}
              </div>
              <p className="px-4 pb-3 text-[9px] text-ink-4 text-center">
                Each button fires a real Guardian pipeline run → modal appears within 400ms
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}