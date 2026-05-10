import { Navigate } from 'react-router-dom';

export default function PublicRoute({ children }) {
  return localStorage.getItem('token')
    ? <Navigate to="/log-glucose" replace />
    : children;
}