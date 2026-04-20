import { NavLink, useNavigate } from 'react-router-dom';

export default function Navbar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/', { replace: true });
  };

  return (
    <header className="navbar">
      <div className="navbar__brand">GlucoBuddy</div>

      <nav className="navbar__links" aria-label="Primary">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            isActive ? 'navbar__link navbar__link--active' : 'navbar__link'
          }
        >
          Dashboard
        </NavLink>

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            isActive ? 'navbar__link navbar__link--active' : 'navbar__link'
          }
        >
          Settings
        </NavLink>

        <button type="button" className="navbar__logout" onClick={handleLogout}>
          Logout
        </button>
      </nav>
    </header>
  );
}
