import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Navbar from './components/Navbar';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import GlucoseLogging from './pages/GlucoseLogging';
import Calculator from './pages/Calculator';
import Settings from './pages/Settings';

function hasToken() {
  return Boolean(localStorage.getItem('token'));
}

function PublicRoute({ children }) {
  return hasToken() ? <Navigate to="/analytics" replace /> : children;
}

function ProtectedRoute({ children }) {
  return hasToken() ? children : <Navigate to="/" replace />;
}

function ProtectedLayout() {
  if (!hasToken()) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <Navbar />
      <main className="page-content">
        <Outlet />
      </main>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
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

        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<Navigate to="/analytics" replace />} />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/log-glucose"
            element={
              <ProtectedRoute>
                <GlucoseLogging />
              </ProtectedRoute>
            }
          />
          <Route
            path="/calculator"
            element={
              <ProtectedRoute>
                <Calculator />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
