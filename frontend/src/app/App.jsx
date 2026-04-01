import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useUserStore } from '@/features/user/userStore'
import { useSocket } from '@/hooks/useSocket'
import ToastContainer from '@/components/ui/Toast'
import Home from '@/pages/Home'
import Pay from '@/pages/Pay'
import History from '@/pages/History'
import Insights from '@/pages/Insights'
import ScoreUp from '@/pages/ScoreUp'

function AppInner() {
  const { isAuthenticated, demoLogin, fetchProfile, user } = useUserStore()
  useSocket(user?.userId)
  useEffect(() => { if (!isAuthenticated) demoLogin(); else fetchProfile(); }, [])
  return (
    <div className="phone-container">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pay" element={<Pay />} />
        <Route path="/history" element={<History />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/scoreup" element={<ScoreUp />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <ToastContainer />
    </div>
  )
}

export default function App() {
  return <BrowserRouter><AppInner /></BrowserRouter>
}
