import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/utils/api';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@werkstack/shared';

export default function SetupPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore(s => s.setUser);
  const setHydrated = useAuthStore(s => s.setHydrated);

  const [orgName, setOrgName]   = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ user: User }>('/api/auth/register', {
        email,
        username,
        password,
        orgName,
      });
      setUser(res.user);
      setHydrated(true);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '5px 10px',
    background: 'var(--color-input-bg, #0f1317)',
    border: '1px solid var(--color-border, #2a3038)',
    borderRadius: '4px',
    color: 'var(--color-text, #d4d9dd)',
    fontSize: '13px',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: 'var(--color-text-muted, #888)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--color-bg, #0f1317)' }}>
      <form onSubmit={handleSubmit} style={{ background: 'var(--color-surface, #1a2028)', padding: '32px', borderRadius: '8px', width: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--color-text, #d4d9dd)' }}>Welcome to WerkStack</h1>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted, #888)', margin: '6px 0 0' }}>
            Create your organization and admin account to get started.
          </p>
        </div>
        {error && <p style={{ color: 'var(--color-error, #e05c5c)', fontSize: '13px', margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={labelStyle}>Organization name</label>
          <input value={orgName} onChange={e => setOrgName(e.target.value)} required
            placeholder="My Homelab" style={inputStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={labelStyle}>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} required
            placeholder="admin" minLength={3} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={labelStyle}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
            style={inputStyle} />
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
            <label style={labelStyle}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              minLength={8} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
            <label style={labelStyle}>Confirm</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
              minLength={8} style={inputStyle} />
          </div>
        </div>
        <button type="submit" disabled={loading}
          style={{ padding: '8px 16px', background: 'var(--color-accent, #c47c5a)', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Setting up…' : 'Create organization'}
        </button>
      </form>
    </div>
  );
}
