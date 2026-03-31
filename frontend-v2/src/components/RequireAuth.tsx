import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hydrated } = useAuthStore();
  if (!hydrated) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
