import { useState, useEffect } from 'react';
import { useNavigate, Link }  from 'react-router-dom';
import { useAuthStore }       from '../../store/useAuthStore';
import { api }                from '../../utils/api';
import type { User }          from '@werkstack/shared';

export function LoginPage() {
  const navigate    = useNavigate();
  const setUser     = useAuthStore(s => s.setUser);
  const setHydrated = useAuthStore(s => s.setHydrated);
  const user        = useAuthStore(s => s.user);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post<{ user: User }>('/api/auth/login', { email, password });
      setUser(res.user);
      setHydrated(true);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  const av = { '--accent': '#c47c5a' } as React.CSSProperties;

  return (
    <div style={{
      ...av,
      minHeight: '100vh',
      background: 'var(--pageBg, #0f1011)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <style>{`
        .act-primary:hover { background: #a25a38 !important; border-color: #a25a38 !important; }
        .wiz-input:focus   { border-color: var(--accent, #c47c5a) !important; }
        .login-link:hover  { color: var(--accent, #c47c5a) !important; }
      `}</style>

      <div style={{
        background: 'var(--cardBg2, #0c0d0e)',
        border: '1px solid var(--border2, #262c30)',
        borderRadius: 14,
        padding: '32px 36px',
        width: 380,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}>
        {/* Brand */}
        <div>
          <div style={{
            fontFamily: "'Ubuntu', sans-serif",
            fontSize: 22, fontWeight: 700,
            color: 'var(--text, #d4d9dd)',
            marginBottom: 4,
          }}>
            WerkStack
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: 'var(--text3, #4e5560)',
          }}>
            infrastructure documentation
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="wiz-field">
            <label className="wiz-label" htmlFor="email">email</label>
            <input
              id="email"
              type="email"
              className="wiz-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="wiz-field">
            <label className="wiz-label" htmlFor="password">password</label>
            <input
              id="password"
              type="password"
              className="wiz-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: 'var(--red, #c07070)',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="act-primary"
            style={{ justifyContent: 'center', marginTop: 4 }}
            disabled={loading}
          >
            {loading ? 'signing in...' : 'sign in'}
          </button>
        </form>

        {/* Footer link */}
        <div style={{
          textAlign:  'center',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize:   10,
          color:      'var(--text3, #4e5560)',
        }}>
          no account yet?{' '}
          <Link
            to="/register"
            className="login-link"
            style={{
              color:      'var(--text2, #8a9299)',
              transition: 'color 0.1s',
            }}
          >
            create one
          </Link>
        </div>
      </div>
    </div>
  );
}
