import { NavLink } from 'react-router-dom';
import { HeartPulse, Calculator, BarChart3, Settings } from 'lucide-react';

export default function MobileNav() {
  const getClass = ({ isActive }) =>
    isActive ? 'mobile-nav__link mobile-nav__link--active' : 'mobile-nav__link';

  return (
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
  );
}