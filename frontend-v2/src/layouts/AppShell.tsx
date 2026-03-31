import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import styles from './AppShell.module.css';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';

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
  const user    = useAuthStore(s => s.user);
  const logout  = useAuthStore(s => s.logout);
  const theme   = useThemeStore(s => s.theme);
  const setTheme = useThemeStore(s => s.setTheme);
  const navigate = useNavigate();

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
          <div className={styles.logo}>
            {collapsed ? 'W' : 'WerkStack'}
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
    </div>
  );
}
