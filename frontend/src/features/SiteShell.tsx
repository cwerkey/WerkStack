import { useEffect } from 'react';
import { Outlet, useParams, useNavigate, Navigate } from 'react-router-dom';
import { AppHeader } from '../components/layout/AppHeader';
import { Sidebar }   from '../components/layout/Sidebar';
import { Topbar }    from '../components/layout/Topbar';
import { useSiteStore } from '../store/useSiteStore';
import { useAuthStore } from '../store/useAuthStore';
import { makeCSS }      from '../styles/theme';
import { DEFAULT_ACCENT } from '../styles/tokens';
import type { Site } from '@werkstack/shared';

// SiteCtx — outlet context provided to all child page screens.
// Every screen reads this with useOutletContext<SiteCtx>().
export interface SiteCtx {
  site?:   Site;
  accent:  string;
  css:     ReturnType<typeof makeCSS>;
}

export function SiteShell() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate   = useNavigate();

  const user  = useAuthStore(s => s.user);
  const sites = useSiteStore(s => s.sites);
  const setActiveSite = useSiteStore(s => s.setActiveSite);

  // Keep active site ID synced with URL
  useEffect(() => {
    if (siteId) setActiveSite(siteId);
    return () => setActiveSite(null);
  }, [siteId, setActiveSite]);

  // Redirect to login if not authenticated
  if (!user) return <Navigate to="/login" replace />;

  const site   = sites.find(s => s.id === siteId);
  const accent = site?.color ?? DEFAULT_ACCENT;
  const css    = makeCSS(accent);

  const ctx: SiteCtx = { site, accent, css };

  return (
    <div style={{ ...css.vars, minHeight: '100vh', background: 'var(--pageBg, #0f1011)' } as React.CSSProperties}>
      <style>{`
        .nav-btn:hover { background: var(--inputBg, #1a1d20) !important; color: var(--accent, #c47c5a) !important; }
        .nav-btn--dim:hover { background: var(--inputBg, #1a1d20) !important; color: var(--accent, #c47c5a) !important; }
        .tab-wrap:hover .tab-btn-inner { color: var(--accent, #c47c5a) !important; }
        .rpill:hover:not(.on) { background: var(--accent-tint, #c47c5a22) !important; border-color: var(--accent, #c47c5a) !important; color: var(--accent, #c47c5a) !important; }
        .rpill.on:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .tpill:hover { filter: brightness(1.2); }
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .btn-outline:hover { background: var(--accent-tint-s, #c47c5a18) !important; color: #d4906a !important; }
      `}</style>

      <AppHeader />

      {site ? (
        <Sidebar site={site} accent={accent} username={user.username} />
      ) : (
        // Minimal sidebar while site loads or not found
        <div className="sidebar" style={{ background: 'var(--cardBg2, #0c0d0e)' }}>
          <div style={{ padding: '10px', flex: 1 }}>
            <button className="nav-btn" onClick={() => navigate('/')}>
              ← all sites
            </button>
            {!site && siteId && (
              <div style={{
                marginTop: 20, padding: '0 8px',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, color: 'var(--text3, #4e5560)',
              }}>
                site not found
              </div>
            )}
          </div>
        </div>
      )}

      <Topbar />

      <main className="content-area">
        <Outlet context={ctx} />
      </main>
    </div>
  );
}
