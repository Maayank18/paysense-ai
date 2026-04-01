import TopBar from './TopBar';
import BottomNav from './BottomNav';
import { cx } from '@/utils/helpers';

/**
 * PaytmShell — wraps every page with the Paytm top bar + bottom nav.
 * Renders children in a scrollable content area that accounts for both bars.
 */
export default function PaytmShell({
  children,
  title,
  showBack,
  showSearch,
  showBell,
  topBarRight,
  hideNav = false,
  className = '',
  noPadding = false,
}) {
  return (
    <>
      <TopBar
        title={title}
        showBack={showBack}
        showSearch={showSearch}
        showBell={showBell}
        rightAction={topBarRight}
      />

      <main
        className={cx('page-content', className)}
        style={noPadding ? { padding: 0 } : undefined}
      >
        {children}
      </main>

      {!hideNav && <BottomNav />}
    </>
  );
}