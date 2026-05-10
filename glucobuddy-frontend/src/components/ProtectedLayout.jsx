import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from './Navbar';
import MobileNav from './MobileNav';

export default function ProtectedLayout() {
  if (!localStorage.getItem('token')) {
    return <Navigate to="/" replace />;
  }

  const location = useLocation();

  return (
    <>
      <Navbar />

      <main className="page-content">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ x: '20%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-10%', opacity: 0 }}
            transition={{
              duration: 0.3,
              ease: [0.25, 1, 0.5, 1],
            }}
            style={{ minHeight: '100%', overflowX: 'hidden' }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <MobileNav />
    </>
  );
}