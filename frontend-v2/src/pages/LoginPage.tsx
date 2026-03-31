import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/utils/api';
import type { User } from '@werkstack/shared';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post<{ user: User }>('/api/auth/login', { email, password });
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--color-bg, #0f1317)' }}>
      <form onSubmit={handleSubmit} style={{ background: 'var(--color-surface, #1a2028)', padding: '32px', borderRadius: '8px', width: '360px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--color-text, #d4d9dd)' }}>Sign in to WerkStack</h1>
        {error && <p style={{ color: '#e05c5c', fontSize: '13px', margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '11px', color: 'var(--color-text-muted, #888)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
            style={{ padding: '5px 10px', background: 'var(--color-input-bg, #0f1317)', border: '1px solid var(--color-border, #2a3038)', borderRadius: '4px', color: 'var(--color-text, #d4d9dd)', fontSize: '13px' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '11px', color: 'var(--color-text-muted, #888)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
            style={{ padding: '5px 10px', background: 'var(--color-input-bg, #0f1317)', border: '1px solid var(--color-border, #2a3038)', borderRadius: '4px', color: 'var(--color-text, #d4d9dd)', fontSize: '13px' }} />
        </div>
        <button type="submit" disabled={loading}
          style={{ padding: '8px 16px', background: 'var(--color-accent, #c47c5a)', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
