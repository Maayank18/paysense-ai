import { useNavigate } from 'react-router-dom';
import { Bell, Search, ArrowLeft, MoreVertical } from 'lucide-react';
import { useUserStore } from '@/features/user/userStore';
import { getInitials, getAvatarColor } from '@/utils/helpers';

export default function TopBar({ title, showBack, showSearch = true, showBell = true, rightAction }) {
  const navigate = useNavigate();
  const user = useUserStore(s => s.user);

  // Home top bar
  if (!title) {
    const initials = getInitials(user?.name || 'MG');
    const { bg, text } = getAvatarColor(user?.name || 'MG');

    return (
      <header
        className="fixed top-0 left-0 right-0 z-40 bg-white mx-auto"
        style={{ maxWidth: 430, height: 56 }}
      >
        <div className="flex items-center h-full px-4 gap-3">
          {/* Avatar */}
          <button
            onClick={() => navigate('/profile')}
            className="avatar w-9 h-9 text-sm font-700 flex-shrink-0 ripple"
            style={{ background: bg, color: text }}
          >
            {initials}
          </button>

          {/* Paytm × UPI Logo — centered */}
          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-1">
              <span className="text-[#002970] font-[800] text-xl tracking-tight"
                    style={{ fontFamily: 'DM Sans, sans-serif', letterSpacing: '-0.5px' }}>
                paytm
              </span>
              <span className="text-red-500 text-base">❤</span>
              {/* UPI logo */}
              <div className="flex items-center">
                <span className="font-[700] text-sm" style={{ color: '#FF6B00' }}>U</span>
                <span className="font-[700] text-sm" style={{ color: '#009900' }}>P</span>
                <span className="font-[700] text-sm" style={{ color: '#002B6E' }}>I</span>
                <span className="font-[700] text-sm" style={{ color: '#FF6B00' }}>»</span>
              </div>
            </div>
          </div>

          {/* Right icons */}
          <div className="flex items-center gap-2">
            {showSearch && (
              <button className="p-1.5 ripple rounded-full" onClick={() => navigate('/search')}>
                <Search size={20} className="text-ink-2" strokeWidth={2} />
              </button>
            )}
            {showBell && (
              <button className="p-1.5 ripple rounded-full relative" onClick={() => navigate('/notifications')}>
                <Bell size={20} className="text-ink-2" strokeWidth={2} />
                {/* Notification dot */}
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              </button>
            )}
          </div>
        </div>
        {/* Bottom border */}
        <div className="h-px bg-gray-100 absolute bottom-0 left-0 right-0" />
      </header>
    );
  }

  // Inner page top bar (with back button)
  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 bg-white mx-auto"
      style={{ maxWidth: 430, height: 56 }}
    >
      <div className="flex items-center h-full px-2 gap-1">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="p-2 ripple rounded-full"
          >
            <ArrowLeft size={22} className="text-ink" strokeWidth={2} />
          </button>
        )}
        <h1 className="flex-1 text-[17px] font-[700] text-ink ml-1 truncate">
          {title}
        </h1>
        {rightAction && (
          <div className="flex items-center gap-1">
            {rightAction}
          </div>
        )}
      </div>
      <div className="h-px bg-gray-100 absolute bottom-0 left-0 right-0" />
    </header>
  );
}