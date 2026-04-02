import type { DrawerTab } from '@werkstack/shared';
import styles from './DetailDrawer.module.css';

interface DetailDrawerProps {
  open: boolean;
  activeTab: DrawerTab;
  visibleTabs: DrawerTab[];
  onTabChange: (tab: DrawerTab) => void;
  onClose: () => void;
  children: React.ReactNode;
}

const TAB_LABELS: Record<DrawerTab, string> = {
  info:    'Info',
  ports:   'Ports',
  storage: 'Storage',
  pcie:    'PCIe',
  os:      'OS',
  network: 'Network',
  guides:  'Guides',
};

export function DetailDrawer({ open, activeTab, visibleTabs, onTabChange, onClose, children }: DetailDrawerProps) {
  if (!open) return null;

  return (
    <aside className={styles.drawer}>
      <div className={styles.header}>
        <div className={styles.tabs}>
          {visibleTabs.map(tabId => (
            <button
              key={tabId}
              className={`${styles.tab}${activeTab === tabId ? ` ${styles.tabActive}` : ''}`}
              onClick={() => onTabChange(tabId)}
            >
              {TAB_LABELS[tabId]}
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
