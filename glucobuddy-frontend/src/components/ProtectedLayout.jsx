import Navbar from './Navbar';
import MobileNav from './MobileNav';
import { Outlet } from 'react-router-dom';

export default function ProtectedLayout() {
  return (
    <>
      <Navbar />

      <main className="page-content">
        <Outlet />
      </main>

      <MobileNav />
    </>
  );
}