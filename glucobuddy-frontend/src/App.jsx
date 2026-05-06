import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import GlucoseLogging from './pages/GlucoseLogging';
import Calculator from './pages/Calculator';
import Settings from './pages/Settings';
import Terms from './pages/Terms';
import Privacy from './pages/privacy';
import MobileNav from './components/MobileNav';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';

function hasToken() {
  return Boolean(localStorage.getItem('token'));
}

// Public routes (redirect if logged in)
function PublicRoute({ children }) {
  return hasToken() ? <Navigate to="/log-glucose" replace /> : children;
}

// Layout for all protected pages
function ProtectedLayout() {
  if (!hasToken()) {
    return <Navigate to="/" replace />;
  }

  const location = useLocation();

  return (
    <>
      <Navbar />

      <main className="page-content">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ x: '20%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-10%', opacity: 0 }}
            transition={{
              duration: 0.3,
              ease: [0.25, 1, 0.5, 1]
            }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <MobileNav />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* ---------- PUBLIC ---------- */}
        <Route
          path="/"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        <Route
          path="/register"
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          }
        />

        <Route
          path="/terms"
          element={
            <PublicRoute>
              <Terms />
            </PublicRoute>
          }
        />

        <Route
          path="/privacy"
          element={
            <PublicRoute>
              <Privacy />
            </PublicRoute>
          }
        />

        {/* ---------- PROTECTED ---------- */}
        <Route element={<ProtectedLayout />}>

          {/* redirect old route */}
          <Route path="/dashboard" element={<Navigate to="/analytics" replace />} />

          <Route path="/analytics" element={<Dashboard />} />
          <Route path="/log-glucose" element={<GlucoseLogging />} />
          <Route path="/calculator" element={<Calculator />} />
          <Route path="/settings" element={<Settings />} />

        </Route>

        {/* ---------- FALLBACK ---------- */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;