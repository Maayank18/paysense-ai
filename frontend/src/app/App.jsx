import { useEffect } from 'react';
import { useUserStore }   from '@/features/user/userStore';
import { useSocket }      from '@/hooks/useSocket';
import ToastContainer     from '@/components/ui/Toast';
import AppRoutes          from './routes';

export default function App() {
  const { token, user, demoLogin, fetchProfile } = useUserStore();

  // Connect sockets once userId is available
  useSocket(user?.userId);

  // Auto-authenticate on first load
  useEffect(() => {
    if (token && !user) {
      fetchProfile();
    } else if (!token) {
      demoLogin();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="phone-container">
      <AppRoutes />
      <ToastContainer />
    </div>
  );
}