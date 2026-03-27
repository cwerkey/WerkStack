import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import type { Site } from '@werkstack/shared';

// ── Hardcoded nav — IDs, labels, icons, order are fixed (Part 5 of spec) ─────

const PAGES = [
  { id: 'overview',   label: 'overview',   icon: 'overview'  },
  { id: 'rack_view',  label: 'rack_view',  icon: 'rack'      },
  { id: 'cable_map',  label: 'cable_map',  icon: 'cable'     },
  { id: 'topology',   label: 'topology',   icon: 'topology'  },
  { id: 'storage',    label: 'storage',    icon: 'storage'   },
  { id: 'os_stack',   label: 'os_stack',   icon: 'layers'    },
  { id: 'ip_plan',    label: 'ip_plan',    icon: 'globe'     },
  { id: 'guides',     label: 'guides',     icon: 'book'      },
  { id: 'device_lib', label: 'device_lib', icon: 'library'   },
  { id: 'tickets',    label: 'tickets',    icon: 'ticket'    },
  { id: 'users',      label: 'users',      icon: 'users'     },
  { id: 'blueprints', label: 'blueprints', icon: 'edit'      },
  { id: 'ledger',     label: 'ledger',     icon: 'layers'    },
  { id: 'monitor',    label: 'monitor',    icon: 'zap'       },
] as const;

const ADMIN = [
  { id: 'rack_setup',   label: 'rack_setup',   icon: 'rack'     },
  { id: 'site_options', label: 'site_options', icon: 'settings' },
] as const;

interface SidebarProps {
  site:    Site;
  accent:  string;
  username?: string;
}

export function Sidebar({ site, accent, username }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Active page from URL third segment
  const activePage = location.pathname.split('/').filter(Boolean)[2] ?? 'overview';

  function go(pageId: string) {
    navigate(`/sites/${site.id}/${pageId}`);
  }

  const initial = username?.[0]?.toUpperCase() ?? '?';

  return (
    <>
      <nav className="sidebar">
        {/* Site identity row */}
        <div style={{
          height: 38, display: 'flex', alignItems: 'center',
          padding: '0 10px', gap: 8, flexShrink: 0,
        }}>
          <span style={{
            width: 9, height: 9, borderRadius: '50%',
            background: accent, flexShrink: 0,
          }} />
          <span style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 14, fontWeight: 700,
            color: 'var(--text, #d4d9dd)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, minWidth: 0,
          }}>
            {site.name}
          </span>
        </div>

        {/* Location + back */}
        <div style={{ padding: '0 10px 6px', flexShrink: 0 }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: 'var(--text3, #4e5560)', marginBottom: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {site.location}
          </div>
          <button
            className="nav-btn"
            onClick={() => navigate('/')}
            style={{ padding: '3px 4px' }}
          >
            <Icon name="arrowLeft" size={11} />
            <span>all sites</span>
          </button>
        </div>

        {/* Main nav */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {PAGES.map(p => (
            <button
              key={p.id}
              className={`nav-btn${activePage === p.id ? ' active' : ''}`}
              onClick={() => go(p.id)}
            >
              <Icon name={p.icon} size={13} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>

        {/* Admin nav */}
        <div style={{
          borderTop: '1px solid var(--border2, #262c30)',
          padding: '4px 6px',
          display: 'flex', flexDirection: 'column', gap: 1,
          flexShrink: 0,
        }}>
          {ADMIN.map(p => (
            <button
              key={p.id}
              className={`nav-btn nav-btn--dim${activePage === p.id ? ' active' : ''}`}
              onClick={() => go(p.id)}
            >
              <Icon name={p.icon} size={13} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>

        {/* User footer */}
        <div style={{
          borderTop: '1px solid var(--border2, #262c30)',
          padding: '7px 10px',
          display: 'flex', alignItems: 'center', gap: 8,
          flexShrink: 0,
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            background: accent, color: '#0c0d0e',
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {initial}
          </div>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            color: 'var(--text3, #4e5560)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {username ?? 'user'}
          </span>
        </div>
      </nav>
      {/* Vertical divider */}
      <div className="sidebar-divider" />
    </>
  );
}
