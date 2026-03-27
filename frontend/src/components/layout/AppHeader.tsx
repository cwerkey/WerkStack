import { useState, useRef, useEffect } from 'react';
import { Icon } from '../ui/Icon';
import { useAuthStore } from '../../store/useAuthStore';
import { useThemeStore, OS_THEME_LABELS, OS_THEME_DOT_COLOR } from '../../store/useThemeStore';
import type { OsThemeMode } from '../../store/useThemeStore';
import { api } from '../../utils/api';

const MODES: OsThemeMode[] = ['homelab-dark', 'enterprise-dark', 'enterprise-light'];

interface AppHeaderProps {
  actions?: React.ReactNode;
}

export function AppHeader({ actions }: AppHeaderProps) {
  const user       = useAuthStore(s => s.user);
  const logout     = useAuthStore(s => s.logout);
  const osTheme    = useThemeStore(s => s.osTheme);
  const setOsTheme = useThemeStore(s => s.setOsTheme);

  const [popupOpen, setPopupOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  // Close popup on outside click
  useEffect(() => {
    if (!popupOpen) return;
    function handle(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setPopupOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [popupOpen]);

  async function handleLogout() {
    try { await api.post('/api/auth/logout'); } catch { /* ignore */ }
    logout();
    setPopupOpen(false);
  }

  const initial = user?.username?.[0]?.toUpperCase() ?? '?';

  return (
    <header className="app-header">
      <span className="app-header-brand">WerkStack</span>
      <div style={{ flex: 1 }} />
      {actions && (
        <>
          {actions}
          <div style={{ width: 1, height: 20, background: 'var(--border2, #262c30)', margin: '0 12px', flexShrink: 0 }} />
        </>
      )}

      {/* Profile avatar */}
      <div ref={popupRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setPopupOpen(o => !o)}
          style={{
            width: 26, height: 26, borderRadius: '50%',
            background: 'var(--accent, #c47c5a)',
            color: '#0c0d0e',
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', cursor: 'pointer', flexShrink: 0,
          }}
        >
          {initial}
        </button>

        {popupOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
            background: 'var(--cardBg2, #0c0d0e)',
            border: '1px solid var(--border2, #262c30)',
            borderRadius: 6, minWidth: 200, zIndex: 1200,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            padding: '4px 0',
          }}>
            {/* User info */}
            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--accent, #c47c5a)',
                color: '#0c0d0e', fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {initial}
              </div>
              <div>
                <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--text, #d4d9dd)' }}>
                  {user?.username ?? 'Guest'}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text3, #4e5560)' }}>
                  {user?.email ?? ''}
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--border2, #262c30)', margin: '2px 0' }} />

            <button className="dropdown-item"><Icon name="user" size={13} />edit profile</button>
            <button className="dropdown-item"><Icon name="settings" size={13} />app options</button>
            {(user?.role === 'owner' || user?.role === 'admin') && (
              <button className="dropdown-item"><Icon name="users" size={13} />manage users</button>
            )}

            <div style={{ height: 1, background: 'var(--border2, #262c30)', margin: '2px 0' }} />

            {/* OS Stack theme picker */}
            <div style={{ padding: '6px 12px 4px' }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                color: 'var(--text3, #4e5560)', textTransform: 'uppercase',
                letterSpacing: '0.08em', marginBottom: 4,
              }}>
                OS Stack View
              </div>
              {MODES.map(m => (
                <button
                  key={m}
                  onClick={() => setOsTheme(m)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '4px 0', width: '100%', background: 'none',
                    border: 'none', cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11, color: 'var(--text2, #8a9299)',
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: OS_THEME_DOT_COLOR[m], flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{OS_THEME_LABELS[m]}</span>
                  {osTheme === m && <Icon name="check" size={11} />}
                </button>
              ))}
            </div>

            <div style={{ height: 1, background: 'var(--border2, #262c30)', margin: '2px 0' }} />
            <button className="dropdown-item danger" onClick={handleLogout}>
              <Icon name="logout" size={13} />sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
