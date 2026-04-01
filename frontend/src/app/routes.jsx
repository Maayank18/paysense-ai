import { Routes, Route, Navigate } from 'react-router-dom';
import Home     from '@/pages/Home';
import Pay      from '@/pages/Pay';
import History  from '@/pages/History';
import Insights from '@/pages/Insights';
import ScoreUp  from '@/pages/ScoreUp';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/"         element={<Home />} />
      <Route path="/pay"      element={<Pay />} />
      <Route path="/history"  element={<History />} />
      <Route path="/insights" element={<Insights />} />
      <Route path="/scoreup"  element={<ScoreUp />} />
      <Route path="*"         element={<Navigate to="/" replace />} />
    </Routes>
  );
}