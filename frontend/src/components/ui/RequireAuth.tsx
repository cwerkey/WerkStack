// RequireAuth — route guard for protected pages.
//
// Three states:
//   1. isHydrated = false → show a full-screen loading indicator while the
//      AuthHydrator fires GET /api/auth/me (avoids redirect flash)
//   2. isHydrated = true, user = null → redirect to /login
//   3. isHydrated = true, user set  → render children

import { Navigate }    from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';

interface Props {
  children: React.ReactNode;
}

export function RequireAuth({ children }: Props) {
  const user       = useAuthStore(s => s.user);
  const isHydrated = useAuthStore(s => s.isHydrated);

  // Session not yet resolved — hold the render
  if (!isHydrated) {
    return (
      <div style={{
        minHeight:      '100vh',
        background:     'var(--pageBg, #0f1011)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize:   11,
          color:      'var(--text3, #4e5560)',
          letterSpacing: '0.04em',
        }}>
          loading...
        </span>
      </div>
    );
  }

  // Not authenticated — send to login
  if (!user) return <Navigate to="/login" replace />;

  // Authenticated — render the protected subtree
  return <>{children}</>;
}
