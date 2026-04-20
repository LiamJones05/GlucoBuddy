import { useState } from 'react';
import API from '../api/api';
import { useNavigate } from 'react-router-dom';
import {Link} from 'react-router-dom';
import logo from '../Assets/Logo.png';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const res = await API.post('/auth/login', form);
      localStorage.setItem('token', res.data.token);
      navigate('/dashboard');
    } catch (err) {
      console.error(err);
      alert('Login failed');
    }
  };

 return (
  <div className="auth-container">
    <div className="auth-card">
      
      <img src={logo} alt="GlucoBuddy Logo" className="auth-logo-img" />

      {/* 👇 ADD INPUTS HERE */}
      <input
        className="auth-input"
        placeholder="Email Address"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />

      <input
        className="auth-input"
        type="password"
        placeholder="Password"
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />

      <div className="auth-actions">
        <button 
          className="auth-button primary" 
          onClick={handleLogin}
        >
          LOGIN
        </button>

        <button 
          className="auth-button secondary"
          onClick={() => navigate('/register')}
        >
          Sign Up
        </button>
      </div>

    </div>
  </div>
);
  
}