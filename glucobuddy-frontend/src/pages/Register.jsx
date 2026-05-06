import { useState, useEffect } from 'react';
import { register } from '../api/services/authService';
import { useNavigate, Link } from 'react-router-dom';
import LogoLight from '../Assets/Logo.png';
import LogoDark from '../Assets/Logo_dark.png';



export default function Register() {
const [logoSrc, setLogoSrc] = useState(LogoLight);
useEffect(() => {
  const theme = localStorage.getItem('theme') || 'light';
  setLogoSrc(theme === 'dark' ? LogoDark : LogoLight);
}, []);

  const [form, setForm] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: ''
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ---------------- MODAL STATE ----------------
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);

  const navigate = useNavigate();

  // ---------------- FINAL REGISTER ----------------
  const completeRegister = async () => {
    setLoading(true);
    setError('');

    try {
      await register(form);

      navigate('/');
    } catch (err) {
      console.error('Register error:', err);

      setError(
        err.response?.data?.error || 'Register failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ---------------- SIGNUP CLICK ----------------
  const handleRegisterClick = () => {
    if (
      !form.first_name ||
      !form.last_name ||
      !form.email ||
      !form.password
    ) {
      setError('Please complete all fields');
      return;
    }

    setError('');
    setShowConsentModal(true);
  };

  return (
    <>
      <div className="auth-container">
        <div className="auth-card">
          <img src={logoSrc} alt="GlucoBuddy Logo" className="auth-logo-img" />

          <input
            className="auth-input"
            placeholder="First Name"
            value={form.first_name}
            onChange={(e) =>
              setForm({ ...form, first_name: e.target.value })
            }
          />

          <input
            className="auth-input"
            placeholder="Last Name"
            value={form.last_name}
            onChange={(e) =>
              setForm({ ...form, last_name: e.target.value })
            }
          />

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

          <button
            className="auth-button secondary"
            onClick={handleRegisterClick}
            disabled={loading}
          >
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>

          {error && <p className="form-error">{error}</p>}

          <p className="signup-disclaimer">
            By creating an account, you agree to our{' '}
            <Link to="/terms">Terms of Use</Link>{' '}
            and{' '}
            <Link to="/privacy">Privacy Policy</Link>.
          </p>

          <Link className="auth-link" to="/">
            Already have an account? Login
          </Link>
        </div>
      </div>

      {/* ---------------- CONSENT MODAL ---------------- */}
      {showConsentModal && (
        <div className="modal-overlay">
          <div className="consent-modal">
            <h2>Agreement Required</h2>

            <p className="consent-text">
              To continue you must agree to the Terms of Use
              and Privacy Policy.
            </p>

            <div className="consent-checkbox">
              <input
                type="checkbox"
                id="terms"
                checked={agreedTerms}
                onChange={(e) => setAgreedTerms(e.target.checked)}
              />

              <label htmlFor="terms">
                I agree to the{' '}
                <Link to="/terms" target="_blank">
                  Terms of Use
                </Link>
              </label>
            </div>

            <div className="consent-checkbox">
              <input
                type="checkbox"
                id="privacy"
                checked={agreedPrivacy}
                onChange={(e) => setAgreedPrivacy(e.target.checked)}
              />

              <label htmlFor="privacy">
                I agree to the{' '}
                <Link to="/privacy" target="_blank">
                  Privacy Policy
                </Link>
              </label>
            </div>

            <div className="modal-buttons">
              <button
                className="modal-cancel"
                onClick={() => {
                  setShowConsentModal(false);
                  setAgreedTerms(false);
                  setAgreedPrivacy(false);
                }}
              >
                Cancel
              </button>

              <button
                className="modal-confirm"
                disabled={!agreedTerms || !agreedPrivacy || loading}
                onClick={completeRegister}
              >
                {loading ? 'Creating...' : 'Continue'}
              </button>
            </div>

            {error && <p className="form-error">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}