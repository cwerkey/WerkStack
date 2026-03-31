import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/utils/api';
import type { User, Site } from '@werkstack/shared';

/**
 * Checks the session on mount. If no valid session, redirects to /login.
 * Place this inside BrowserRouter so useNavigate works.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setUser     = useAuthStore(s => s.setUser);
  const setHydrated = useAuthStore(s => s.setHydrated);
  const hydrated    = useAuthStore(s => s.hydrated);
  const isAuth      = useAuthStore(s => s.isAuthenticated);
  const navigate    = useNavigate();
  const location    = useLocation();

  useEffect(() => {
    if (hydrated) return;
    api.get<{ user: User; sites: Site[] }>('/api/auth/me')
      .then(res => setUser(res.user))
      .catch(() => {
        setUser(null);
        if (location.pathname !== '/login') {
          navigate('/login', { replace: true });
        }
      })
      .finally(() => setHydrated(true));
  }, [hydrated, setUser, setHydrated, navigate, location.pathname]);

  // While hydrating, show nothing (prevents flash of protected content)
  if (!hydrated && !isAuth) return null;

  return <>{children}</>;
}
