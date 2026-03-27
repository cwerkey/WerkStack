import { useState, useEffect } from 'react';
import { useNavigate, Link }   from 'react-router-dom';
import { useAuthStore }        from '../../store/useAuthStore';
import { useSiteStore }        from '../../store/useSiteStore';
import { api }                 from '../../utils/api';
import type { User }           from '@werkstack/shared';

interface RegisterResponse {
  user: User;
  org:  { id: string; name: string; slug: string; createdAt: string };
}

export function RegisterPage() {
  const navigate    = useNavigate();
  const setUser     = useAuthStore(s => s.setUser);
  const setHydrated = useAuthStore(s => s.setHydrated);
  const setSites    = useSiteStore(s => s.setSites);
  const user        = useAuthStore(s => s.user);

  const [email,    setEmail]    = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [orgName,  setOrgName]  = useState('');
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
      const res = await api.post<RegisterResponse>('/api/auth/register', {
        email,
        username,
        password,
        orgName,
      });
      setUser(res.user);
      setSites([]);      // fresh org — no sites yet
      setHydrated(true);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  const av = { '--accent': '#c47c5a' } as React.CSSProperties;

  return (
    <div style={{
      ...av,
      minHeight:       '100vh',
      background:      'var(--pageBg, #0f1011)',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
    }}>
      <style>{`
        .act-primary:hover { background: #a25a38 !important; border-color: #a25a38 !important; }
        .wiz-input:focus    { border-color: var(--accent, #c47c5a) !important; }
        .reg-link:hover     { color: var(--accent, #c47c5a) !important; }
      `}</style>

      <div style={{
        background:     'var(--cardBg2, #0c0d0e)',
        border:         '1px solid var(--border2, #262c30)',
        borderRadius:   14,
        padding:        '32px 36px',
        width:          400,
        display:        'flex',
        flexDirection:  'column',
        gap:            24,
      }}>
        {/* Brand */}
        <div>
          <div style={{
            fontFamily:  "'Ubuntu', sans-serif",
            fontSize:    22,
            fontWeight:  700,
            color:       'var(--text, #d4d9dd)',
            marginBottom: 4,
          }}>
            WerkStack
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize:   11,
            color:      'var(--text3, #4e5560)',
          }}>
            create your account
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div className="wiz-field">
            <label className="wiz-label" htmlFor="reg-orgname">organization name</label>
            <input
              id="reg-orgname"
              type="text"
              className="wiz-input"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder="Acme Corp"
              autoComplete="organization"
              required
              maxLength={100}
            />
          </div>

          <div className="wiz-field">
            <label className="wiz-label" htmlFor="reg-username">username</label>
            <input
              id="reg-username"
              type="text"
              className="wiz-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="jdoe"
              autoComplete="username"
              required
              minLength={3}
              maxLength={50}
            />
          </div>

          <div className="wiz-field">
            <label className="wiz-label" htmlFor="reg-email">email</label>
            <input
              id="reg-email"
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
            <label className="wiz-label" htmlFor="reg-password">
              password
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize:   9,
                color:      'var(--text3, #4e5560)',
                marginLeft: 6,
              }}>
                min 8 chars
              </span>
            </label>
            <input
              id="reg-password"
              type="password"
              className="wiz-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>

          {error && (
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize:   10,
              color:      'var(--red, #c07070)',
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
            {loading ? 'creating account...' : 'create account'}
          </button>
        </form>

        {/* Footer link */}
        <div style={{
          textAlign:  'center',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize:   10,
          color:      'var(--text3, #4e5560)',
        }}>
          already have an account?{' '}
          <Link
            to="/login"
            className="reg-link"
            style={{
              color:      'var(--text2, #8a9299)',
              transition: 'color 0.1s',
            }}
          >
            sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
