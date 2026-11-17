import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './authContext';

/** Route guard: anyone who is not a signed-in admin is sent to /login. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { restoring, user } = useAuth();
  const location = useLocation();
  if (restoring) {
    return (
      <p className="muted page-status" role="status">
        {t('common.loading')}
      </p>
    );
  }
  if (!user || user.role !== 'admin') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
