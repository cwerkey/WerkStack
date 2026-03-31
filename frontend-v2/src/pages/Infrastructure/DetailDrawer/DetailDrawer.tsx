import type { DrawerTab } from '@werkstack/shared';
import styles from './DetailDrawer.module.css';

interface DetailDrawerProps {
  open: boolean;
  activeTab: DrawerTab;
  onTabChange: (tab: DrawerTab) => void;
  onClose: () => void;
  children: React.ReactNode;
}

const TABS: { id: DrawerTab; label: string }[] = [
  { id: 'info',    label: 'Info' },
  { id: 'ports',   label: 'Ports' },
  { id: 'storage', label: 'Storage' },
  { id: 'os',      label: 'OS' },
  { id: 'network', label: 'Network' },
  { id: 'guides',  label: 'Guides' },
];

export function DetailDrawer({ open, activeTab, onTabChange, onClose, children }: DetailDrawerProps) {
  if (!open) return null;

  return (
    <aside className={styles.drawer}>
      <div className={styles.header}>
        <div className={styles.tabs}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`${styles.tab}${activeTab === tab.id ? ` ${styles.tabActive}` : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button className={styles.closeBtn} onClick={onClose} title="Close">&times;</button>
      </div>
      <div className={styles.body}>
        {children}
      </div>
    </aside>
  );
}
