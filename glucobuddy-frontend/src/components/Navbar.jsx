import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import API from '../api/api';
import Logo from '../Assets/Logo.png';

export default function Navbar() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState(() => localStorage.getItem('userName') || 'Account');

  useEffect(() => {
    let isMounted = true;

    const fetchUser = async () => {
      try {
        const res = await API.get('/auth/me');
        if (isMounted) {
          const resolvedName = res.data?.name || res.data?.first_name || 'Account';
          setUserName(resolvedName);
          if (resolvedName !== 'Account') {
            localStorage.setItem('userName', resolvedName);
          }
        }
      } catch (err) {
        console.error('Error fetching current user:', err);
        if (isMounted) {
          setUserName(localStorage.getItem('userName') || 'Account');
        }
      }
    };

    fetchUser();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    navigate('/', { replace: true });
  };

  const getLinkClass = ({ isActive }) =>
    isActive ? 'navbar__link navbar__link--active' : 'navbar__link';

  return (
    <header className="navbar">
      <div className="navbar__brand" aria-label="GlucoBuddy">
        <img src={Logo} alt="GlucoBuddy" className="navbar__logo" />
        <span className="navbar__user">{userName}</span>
      </div>

      <nav className="navbar__links" aria-label="Primary">
        <NavLink to="/analytics" className={getLinkClass}>
          Analytics
        </NavLink>

        <NavLink to="/log-glucose" className={getLinkClass}>
          Log
        </NavLink>

        <NavLink to="/calculator" className={getLinkClass}>
          Calculator
        </NavLink>

        <NavLink to="/settings" className={getLinkClass}>
          Settings
        </NavLink>

        <button type="button" className="navbar__logout" onClick={handleLogout}>
          Logout
        </button>
      </nav>
    </header>
  );
}

