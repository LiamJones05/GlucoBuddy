import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import {
  HeartPulse,
  Calculator,
  BarChart3,
  Settings,
  Sun,
  Moon,
  LogOut,
} from 'lucide-react';

export default function MobileNav() {
  const navigate = useNavigate();

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    window.dispatchEvent(new Event('themechange'));
  }, [theme]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userName');

    navigate('/', { replace: true });
  };

  const getClass = ({ isActive }) =>
    isActive
      ? 'mobile-nav__link mobile-nav__link--active'
      : 'mobile-nav__link';

  return (
    <>
      <div className="mobile-nav__top-actions">

        <button
          className="mobile-nav__icon-button"
          onClick={() =>
            setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
          }
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <button
          className="mobile-nav__icon-button"
          onClick={handleLogout}
          aria-label="Logout"
        >
          <LogOut size={18} />
        </button>

      </div>

      <div className="mobile-nav">
        <NavLink to="/log-glucose" className={getClass}>
          <HeartPulse size={20} />
          <span>Log</span>
        </NavLink>

        <NavLink to="/calculator" className={getClass}>
          <Calculator size={20} />
          <span>Calc</span>
        </NavLink>

        <NavLink to="/analytics" className={getClass}>
          <BarChart3 size={20} />
          <span>Stats</span>
        </NavLink>

        <NavLink to="/settings" className={getClass}>
          <Settings size={20} />
          <span>Settings</span>
        </NavLink>
      </div>
    </>
  );
}