import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMaintenanceMode } from '@/hooks/useMaintenanceMode';
import { MaintenancePage } from '@/components/MaintenanceMode';

/**
 * Global maintenance gate.
 * When maintenance mode is ON, EVERY route (including the landing page)
 * shows the maintenance page for non-admins.
 * Only the login page (/auth) and admin routes (/admin*) stay reachable,
 * so an admin can sign in and turn maintenance off.
 */
export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isAdmin } = useAuth();
  const { isMaintenanceMode } = useMaintenanceMode();

  const path = location.pathname;
  const isAdminEntry = path === '/auth' || path.startsWith('/admin');

  if (isMaintenanceMode && !isAdmin && !isAdminEntry) {
    return <MaintenancePage />;
  }

  return <>{children}</>;
}
