import { useState, useEffect } from 'react';
import { login } from '../api/services/authService';
import { useNavigate, Link } from 'react-router-dom';
import LogoLight from '../Assets/Logo.png';
import LogoDark from '../Assets/Logo_dark.png';


export default function Login() {
  const [logoSrc, setLogoSrc] = useState(LogoLight);

  useEffect(() => {
    const theme = localStorage.getItem('theme') || 'light';
    setLogoSrc(theme === 'dark' ? LogoDark : LogoLight);
  }, []);

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleLogin = async () => {
    if (!form.email || !form.password) {
      setError('Please enter both email and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await login(form);

      localStorage.setItem('token', res.data.token);

      if (res.data.user?.name) {
        localStorage.setItem('userName', res.data.user.name);
      }

      navigate('/analytics');
    } catch (err) {
      console.error('Login error:', err);

      setError(
        err.response?.data?.error || 'Login failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">

        <img src={logoSrc} alt="GlucoBuddy Logo" className="auth-logo-img" />

        <input
          className="auth-input"
          placeholder="Email Address"
          value={form.email}
          onChange={(e) =>
            setForm({ ...form, email: e.target.value })
          }
        />

        <input
          className="auth-input"
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) =>
            setForm({ ...form, password: e.target.value })
          }
        />

        <div className="auth-actions">
          <button
            className="auth-button primary"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'LOGIN'}
          </button>

          <button
            className="auth-button secondary"
            onClick={() => navigate('/register')}
          >
            Sign Up
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}

        <Link className="auth-link" to="/register">
          Don’t have an account? Sign up
        </Link>

      </div>
    </div>
  );
}