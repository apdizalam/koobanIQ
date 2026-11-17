import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './authContext';

/** Route guard: anyone who is not a signed-in admin is sent to /login. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user || user.role !== 'admin') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
