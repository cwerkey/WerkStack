import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import styles from './AppShell.module.css';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useSiteStore } from '@/stores/siteStore';
import { useGetSites } from '@/api/sites';
import { useGetTypes } from '@/api/types';
import { useTypesStore } from '@/stores/typesStore';
import { OnboardingWizard } from '@/wizards/OnboardingWizard';

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
  const [collapsed, setCollapsed] = useState(false);
  const [sitePickerOpen, setSitePickerOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

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

  // Close picker when clicking outside
  useEffect(() => {
    if (!sitePickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setSitePickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [sitePickerOpen]);

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

  return (
    <div className={styles.shell} data-theme={theme}>
      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
        <div className={styles.sidebarTop}>
          <div ref={pickerRef} className={styles.logoWrap}>
            <button
              className={styles.logo}
              onClick={() => setSitePickerOpen(o => !o)}
              title="Switch site"
            >
              {collapsed ? 'W' : 'WerkStack'}
            </button>
            {!collapsed && currentSite && (
              <span className={styles.currentSite}>{currentSite.name}</span>
            )}
            {sitePickerOpen && (
              <div className={styles.sitePicker}>
                <div className={styles.sitePickerTitle}>Select Site</div>
                {sites.length === 0 && (
                  <div className={styles.sitePickerEmpty}>No sites found</div>
                )}
                {sites.map(site => (
                  <button
                    key={site.id}
                    className={`${styles.siteOption}${currentSite?.id === site.id ? ` ${styles.siteOptionActive}` : ''}`}
                    onClick={() => { setSite(site); setSitePickerOpen(false); }}
                  >
                    {site.name}
                  </button>
                ))}
              </div>
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
        <div className={styles.sidebarBottom}>
          {!collapsed && user && (
            <span className={styles.userEmail}>{user.email}</span>
          )}
          <button className={styles.logoutBtn} onClick={handleLogout} title="Log out">
            {collapsed ? '↩' : 'Log out'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className={styles.main}>
        <header className={styles.header}>
          <button
            className={styles.themeToggle}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
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
    </div>
  );
}
