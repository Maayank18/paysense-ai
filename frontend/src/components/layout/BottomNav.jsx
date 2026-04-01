import { NavLink, useLocation } from 'react-router-dom';
import { Home, Clock, TrendingUp, BarChart3, Shield } from 'lucide-react';
import { cx } from '@/utils/helpers';

const NAV_ITEMS = [
  { path: '/',         label: 'Home',     Icon: Home },
  { path: '/history',  label: 'History',  Icon: Clock },
  { path: '/insights', label: 'Insights', Icon: Shield },
  { path: '/scoreup',  label: 'ScoreUp',  Icon: TrendingUp },
];

export default function BottomNav() {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white z-40 mx-auto"
      style={{
        maxWidth: 430,
        height: 64,
        boxShadow: '0 -2px 16px rgba(0,0,0,0.08)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex h-full">
        {NAV_ITEMS.map(({ path, label, Icon }) => {
          const isActive = path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(path);

          return (
            <NavLink
              key={path}
              to={path}
              className={cx(
                'flex flex-col items-center justify-center flex-1 gap-0.5 transition-all duration-150 ripple',
                isActive ? 'text-paytm-blue' : 'text-ink-3'
              )}
            >
              <div className="relative">
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  className="transition-all"
                />
                {/* Active indicator dot */}
                {isActive && (
                  <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-paytm-blue rounded-full" />
                )}
              </div>
              <span
                className={cx(
                  'text-[10px] font-[600] transition-all',
                  isActive ? 'text-paytm-blue' : 'text-ink-3'
                )}
              >
                {label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}