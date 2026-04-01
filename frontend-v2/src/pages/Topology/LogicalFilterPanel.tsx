import type { OsHost, OsApp, Container } from '@werkstack/shared';
import type { DeviceInstance } from '@werkstack/shared';
import { getIcon, normalizeToSlug } from './simpleIconMap';
import styles from './LogicalFilterPanel.module.css';

interface Props {
  devices: DeviceInstance[];
  hosts: OsHost[];
  apps: OsApp[];
  containers: Container[];
  hiddenDevices: Set<string>;
  hiddenHosts: Set<string>;
  hiddenApps: Set<string>;
  onToggleDevice: (id: string) => void;
  onToggleHost: (id: string) => void;
  onToggleApp: (id: string) => void;
}

function IconGlyph({ name }: { name: string }) {
  const icon = getIcon(name);
  if (!icon) return null;
  return (
    <svg
      className={styles.iconGlyph}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d={icon.path} fill={`#${icon.hex}`} />
    </svg>
  );
}

export function LogicalFilterPanel({
  devices,
  hosts,
  apps,
  containers,
  hiddenDevices,
  hiddenHosts,
  hiddenApps,
  onToggleDevice,
  onToggleHost,
  onToggleApp,
}: Props) {
  // Only show devices that have a host OS configured
  const configuredDevices = devices.filter(d =>
    hosts.some(h => h.deviceId === d.id)
  );

  // All app/container IDs together (for unified filter section)
  const allLeaves = [
    ...apps.map(a => ({ id: a.id, name: a.name, imageOrName: a.name })),
    ...containers.map(c => ({ id: c.id, name: c.name, imageOrName: c.image })),
  ];

  function toggleAllDevices() {
    const allHidden = configuredDevices.every(d => hiddenDevices.has(d.id));
    configuredDevices.forEach(d => {
      const isHidden = hiddenDevices.has(d.id);
      if (allHidden ? true : !isHidden) onToggleDevice(d.id);
    });
  }

  function toggleAllHosts() {
    const allHidden = hosts.every(h => hiddenHosts.has(h.id));
    hosts.forEach(h => {
      const isHidden = hiddenHosts.has(h.id);
      if (allHidden ? true : !isHidden) onToggleHost(h.id);
    });
  }

  function toggleAllApps() {
    const allHidden = allLeaves.every(l => hiddenApps.has(l.id));
    allLeaves.forEach(l => {
      const isHidden = hiddenApps.has(l.id);
      if (allHidden ? true : !isHidden) onToggleApp(l.id);
    });
  }

  return (
    <div className={styles.panel}>
      {/* Devices */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Devices</span>
          {configuredDevices.length > 0 && (
            <button className={styles.toggleAll} onClick={toggleAllDevices}>
              {configuredDevices.every(d => hiddenDevices.has(d.id)) ? 'show all' : 'hide all'}
            </button>
          )}
        </div>
        {configuredDevices.length === 0 && (
          <p className={styles.emptyHint}>No configured devices</p>
        )}
        {configuredDevices.map(d => {
          const visible = !hiddenDevices.has(d.id);
          return (
            <label key={d.id} className={styles.checkItem}>
              <input
                type="checkbox"
                checked={visible}
                onChange={() => onToggleDevice(d.id)}
              />
              <span className={visible ? styles.checkLabel : styles.checkLabelMuted}>
                {d.name}
              </span>
            </label>
          );
        })}
      </div>

      {/* OS */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>OS</span>
          {hosts.length > 0 && (
            <button className={styles.toggleAll} onClick={toggleAllHosts}>
              {hosts.every(h => hiddenHosts.has(h.id)) ? 'show all' : 'hide all'}
            </button>
          )}
        </div>
        {hosts.length === 0 && (
          <p className={styles.emptyHint}>No OS configured</p>
        )}
        {hosts.map(h => {
          const visible = !hiddenHosts.has(h.id);
          const label = h.osVersion ? `${h.hostOs} ${h.osVersion}` : h.hostOs;
          return (
            <label key={h.id} className={styles.checkItem}>
              <input
                type="checkbox"
                checked={visible}
                onChange={() => onToggleHost(h.id)}
              />
              <IconGlyph name={h.hostOs} />
              <span className={visible ? styles.checkLabel : styles.checkLabelMuted}>
                {label}
              </span>
            </label>
          );
        })}
      </div>

      {/* Apps / Containers */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Apps / Containers</span>
          {allLeaves.length > 0 && (
            <button className={styles.toggleAll} onClick={toggleAllApps}>
              {allLeaves.every(l => hiddenApps.has(l.id)) ? 'show all' : 'hide all'}
            </button>
          )}
        </div>
        {allLeaves.length === 0 && (
          <p className={styles.emptyHint}>No apps or containers</p>
        )}
        {allLeaves.map(leaf => {
          const visible = !hiddenApps.has(leaf.id);
          const slug = normalizeToSlug(leaf.imageOrName);
          return (
            <label key={leaf.id} className={styles.checkItem}>
              <input
                type="checkbox"
                checked={visible}
                onChange={() => onToggleApp(leaf.id)}
              />
              <IconGlyph name={slug} />
              <span className={visible ? styles.checkLabel : styles.checkLabelMuted}>
                {leaf.name}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
