import { useState } from 'react';
import API from '../api/api';
import { useNavigate } from 'react-router-dom';
import logo from '../Assets/Logo.png';
import { Link } from 'react-router-dom';

export default function Register() {
  const [form, setForm] = useState({
    email: '', password: '', first_name: '', last_name: ''
  });

  const navigate = useNavigate();

  const handleRegister = async () => {
    try {
      await API.post('/auth/register', form);
      navigate('/');
    } catch {
      alert('Register failed');
    }
  };

  return (
  <div className="auth-container">
    <div className="auth-card">
      <img src={logo} alt="GlucoBuddy Logo" className="auth-logo-img" />

      <input
        className="auth-input"
        placeholder="First Name"
        onChange={(e) => setForm({ ...form, first_name: e.target.value })}
      />

      <input
        className="auth-input"
        placeholder="Last Name"
        onChange={(e) => setForm({ ...form, last_name: e.target.value })}
      />

      <input
        className="auth-input"
        placeholder="Email Address"
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />

      <input
        className="auth-input"
        type="password"
        placeholder="Password"
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />

      <button className="auth-button secondary" onClick={handleRegister}>
        Sign Up
      </button>

      <Link className="auth-link" to="/">
        Back to Login
      </Link>
    </div>
  </div>
);
}