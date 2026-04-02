import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import styles from './AppShell.module.css';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';
import { useSiteStore } from '@/stores/siteStore';
import { useGetSites } from '@/api/sites';
import { useGetTypes } from '@/api/types';
import { useTypesStore } from '@/stores/typesStore';
import { OnboardingWizard } from '@/wizards/OnboardingWizard';
import { ProfileModal } from '@/components/ProfileModal';
import { ManageUsersModal } from '@/components/ManageUsersModal';

type NavItem = {
  label: string;
  icon: string;
  path?: string;
  children?: { label: string; path: string }[];
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', icon: '◈', path: '/' },
  {
    label: 'Infrastructure', icon: '⬡',
    children: [
      { label: 'Rack View', path: '/infrastructure/rack' },
      { label: 'Devices', path: '/infrastructure/devices' },
    ],
  },
  { label: 'Topology', icon: '⬡', path: '/topology' },
  {
    label: 'Storage', icon: '⬢',
    children: [
      { label: 'Pools', path: '/storage/pools' },
      { label: 'Shares', path: '/storage/shares' },
      { label: 'Disks', path: '/storage/disks' },
    ],
  },
  { label: 'OS Overview', icon: '⬡', path: '/os' },
  {
    label: 'Network', icon: '⬡',
    children: [
      { label: 'Subnets', path: '/network/subnets' },
      { label: 'Leases', path: '/network/leases' },
      { label: 'VLANs', path: '/network/vlans' },
    ],
  },
  { label: 'Activity', icon: '⬡', path: '/activity' },
  {
    label: 'Docs', icon: '⬡',
    children: [
      { label: 'Guides', path: '/docs/guides' },
      { label: 'To-Do', path: '/docs/todos' },
    ],
  },
  { label: 'Settings', icon: '⬡', path: '/settings' },
];

const THEMES: { id: ThemeMode; label: string; dot: string }[] = [
  { id: 'dark',            label: 'homelab dark',     dot: '#c47c5a' },
  { id: 'enterprise-dark', label: 'enterprise dark',  dot: '#3d8fd9' },
  { id: 'light',           label: 'enterprise light', dot: '#2e5a8a' },
  { id: 'terminal',        label: 'terminal',         dot: '#33ff33' },
];

function NavItemRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const [open, setOpen] = useState(false);

  if (item.children) {
    return (
      <div>
        <button
          className={styles.navParent}
          onClick={() => setOpen(o => !o)}
          title={collapsed ? item.label : undefined}
        >
          <span className={styles.navIcon}>{item.icon}</span>
          {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
          {!collapsed && <span className={styles.navChevron}>{open ? '▾' : '▸'}</span>}
        </button>
        {open && !collapsed && (
          <div className={styles.navChildren}>
            {item.children.map(child => (
              <NavLink key={child.path} to={child.path} className={({ isActive }) => `${styles.navChild}${isActive ? ' ' + styles.active : ''}`}>
                {child.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.path!}
      end={item.path === '/'}
      className={({ isActive }) => `${styles.navItem}${isActive ? ' ' + styles.active : ''}`}
      title={collapsed ? item.label : undefined}
    >
      <span className={styles.navIcon}>{item.icon}</span>
      {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
    </NavLink>
  );
}

export function AppShell() {
  const [collapsed, setCollapsed]         = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [avatarOpen, setAvatarOpen]       = useState(false);
  const [profileOpen, setProfileOpen]     = useState(false);
  const [usersOpen, setUsersOpen]         = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  const user      = useAuthStore(s => s.user);
  const logout    = useAuthStore(s => s.logout);
  const theme     = useThemeStore(s => s.theme);
  const setTheme  = useThemeStore(s => s.setTheme);
  const navigate  = useNavigate();

  const currentSite = useSiteStore(s => s.currentSite);
  const setSite     = useSiteStore(s => s.setSite);
  const { data: sites = [] } = useGetSites();

  // Load all types globally
  const setAllTypes = useTypesStore(s => s.setAll);
  const { data: typesData } = useGetTypes();
  useEffect(() => {
    if (typesData) setAllTypes(typesData);
  }, [typesData, setAllTypes]);

  // Close avatar menu when clicking outside
  useEffect(() => {
    if (!avatarOpen) return;
    function handleClick(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [avatarOpen]);

  // Show onboarding wizard for new users with no sites
  useEffect(() => {
    if (sites.length === 0 && !localStorage.getItem('onboarding_complete')) {
      setOnboardingOpen(true);
    }
  }, [sites]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    logout();
    navigate('/login');
  }

  const initial = (user?.username?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase();
  const accentColor = user?.accentColor ?? 'var(--color-accent, #c47c5a)';
  const isOwner = user?.role === 'owner';

  return (
    <div className={styles.shell} data-theme={theme}>
      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
        <div className={styles.sidebarTop}>
          <div className={styles.logoWrap}>
            <button
              className={styles.logo}
              onClick={() => navigate('/sites')}
              title="All sites"
            >
              {collapsed ? 'W' : 'WerkStack'}
            </button>
            {!collapsed && currentSite && (
              <span className={styles.currentSite}>{currentSite.name}</span>
            )}
          </div>
          <button className={styles.collapseBtn} onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expand' : 'Collapse'}>
            {collapsed ? '▶' : '◀'}
          </button>
        </div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map(item => (
            <NavItemRow key={item.label} item={item} collapsed={collapsed} />
          ))}
        </nav>
        <div className={styles.sidebarBottom} />
      </aside>

      {/* Main */}
      <div className={styles.main}>
        <header className={styles.header}>
          <div ref={avatarRef} className={styles.avatarWrap}>
            <button
              className={styles.avatarBtn}
              style={{ backgroundColor: accentColor }}
              onClick={() => setAvatarOpen(o => !o)}
              title={user?.username ?? 'User'}
            >
              {initial}
            </button>

            {avatarOpen && (
              <div className={styles.avatarMenu}>
                {/* User info */}
                <div className={styles.menuUserInfo}>
                  <div className={styles.menuAvatar} style={{ backgroundColor: accentColor }}>
                    {initial}
                  </div>
                  <div>
                    <div className={styles.menuUserName}>{user?.username}</div>
                    <div className={styles.menuUserEmail}>{user?.email}</div>
                  </div>
                </div>

                <div className={styles.menuDivider} />

                <button className={styles.menuItem} onClick={() => { setAvatarOpen(false); setProfileOpen(true); }}>
                  ✎ edit profile
                </button>
                {isOwner && (
                  <button className={styles.menuItem} onClick={() => { setAvatarOpen(false); setUsersOpen(true); }}>
                    👤 manage users
                  </button>
                )}

                <div className={styles.menuDivider} />

                {/* Theme selector */}
                <div className={styles.menuSectionLabel}>theme</div>
                {THEMES.map(t => (
                  <button
                    key={t.id}
                    className={`${styles.menuItem}${theme === t.id ? ' ' + styles.menuItemActive : ''}`}
                    onClick={() => { useThemeStore.getState().setTheme(t.id); }}
                  >
                    <span className={styles.themeDot} style={{ backgroundColor: t.dot }} />
                    {t.label}
                    {theme === t.id && <span className={styles.themeCheck}>✓</span>}
                  </button>
                ))}

                <div className={styles.menuDivider} />

                <button className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={() => { setAvatarOpen(false); handleLogout(); }}>
                  ↩ sign out
                </button>
              </div>
            )}
          </div>
        </header>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>

      <OnboardingWizard
        open={onboardingOpen}
        onComplete={(site) => {
          setSite(site);
          setOnboardingOpen(false);
          navigate('/infrastructure/rack');
        }}
      />

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <ManageUsersModal open={usersOpen} onClose={() => setUsersOpen(false)} />
    </div>
  );
}
