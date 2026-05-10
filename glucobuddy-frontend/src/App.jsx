import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import GlucoseLogging from './pages/GlucoseLogging';
import Calculator from './pages/Calculator';
import Settings from './pages/Settings';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import PublicRoute from './components/PublicRoute';
import ProtectedLayout from './components/ProtectedLayout';

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* ---------- PUBLIC ---------- */}
        <Route path="/"        element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/terms"    element={<PublicRoute><Terms /></PublicRoute>} />
        <Route path="/privacy"  element={<PublicRoute><Privacy /></PublicRoute>} />

        {/* ---------- PROTECTED ---------- */}
        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard"  element={<Navigate to="/analytics" replace />} />
          <Route path="/analytics"  element={<Dashboard />} />
          <Route path="/log-glucose" element={<GlucoseLogging />} />
          <Route path="/calculator" element={<Calculator />} />
          <Route path="/settings"   element={<Settings />} />
        </Route>

        {/* ---------- FALLBACK ---------- */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;