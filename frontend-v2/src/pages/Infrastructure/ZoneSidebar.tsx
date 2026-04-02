import { useState, useMemo } from 'react';
import type { Zone, Rack, DeviceInstance, DeviceTemplate } from '@werkstack/shared';
import styles from './ZoneSidebar.module.css';

interface ZoneSidebarProps {
  zones: Zone[];
  racks: Rack[];
  devices?: DeviceInstance[];
  templates?: DeviceTemplate[];
  selectedZoneId: string | null;
  selectedRackId: string | null;
  onZoneSelect: (zoneId: string) => void;
  onRackSelect: (rackId: string) => void;
  onDeviceClick?: (deviceId: string) => void;
}

export function ZoneSidebar({
  zones,
  racks,
  devices = [],
  templates = [],
  selectedZoneId,
  selectedRackId,
  onZoneSelect,
  onRackSelect,
  onDeviceClick,
}: ZoneSidebarProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(selectedZoneId ? [selectedZoneId] : []),
  );
  const [unrackedExpanded, setUnrackedExpanded] = useState(true);

  const unracked = useMemo(
    () => devices.filter(d => !d.rackId && !d.shelfDeviceId),
    [devices],
  );

  function toggleZone(zoneId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(zoneId)) next.delete(zoneId);
      else next.add(zoneId);
      return next;
    });
    onZoneSelect(zoneId);
  }

  function racksForZone(zoneId: string) {
    return racks.filter(r => r.zoneId === zoneId);
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>Zones</div>
      <nav className={styles.list}>
        {zones.length === 0 && (
          <div className={styles.empty}>no zones</div>
        )}
        {zones.map(zone => {
          const isExpanded = expanded.has(zone.id);
          const isSelected = selectedZoneId === zone.id;
          const zoneRacks = racksForZone(zone.id);

          return (
            <div key={zone.id}>
              <button
                className={`${styles.zoneBtn}${isSelected ? ` ${styles.zoneSelected}` : ''}`}
                onClick={() => toggleZone(zone.id)}
              >
                <span className={styles.chevron}>{isExpanded ? '▾' : '▸'}</span>
                <span className={styles.zoneName}>{zone.name}</span>
                <span className={styles.rackCount}>{zoneRacks.length}</span>
              </button>
              {isExpanded && (
                <div className={styles.rackList}>
                  {zoneRacks.length === 0 && (
                    <div className={styles.noRacks}>no racks</div>
                  )}
                  {zoneRacks.map(rack => (
                    <button
                      key={rack.id}
                      className={`${styles.rackBtn}${selectedRackId === rack.id ? ` ${styles.rackSelected}` : ''}`}
                      onClick={() => onRackSelect(rack.id)}
                    >
                      {rack.name}
                      <span className={styles.uHeight}>{rack.uHeight}U</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Unracked devices */}
      <div className={styles.unrackedSection}>
        <button
          className={styles.unrackedHeader}
          onClick={() => setUnrackedExpanded(v => !v)}
        >
          <span className={styles.chevron}>{unrackedExpanded ? '▾' : '▸'}</span>
          <span>UNRACKED</span>
          <span className={styles.rackCount}>{unracked.length}</span>
        </button>
        {unrackedExpanded && (
          <div className={styles.unrackedList}>
            {unracked.length === 0 ? (
              <div className={styles.noRacks}>all devices are racked</div>
            ) : (
              unracked.map(device => {
                const tmpl = templates.find(t => t.id === device.templateId);
                return (
                  <div
                    key={device.id}
                    className={styles.unrackedDevice}
                    draggable
                    onClick={() => onDeviceClick?.(device.id)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('werkstack/device-id', device.id);
                      e.dataTransfer.setData('werkstack/device-uheight', String(device.uHeight ?? tmpl?.uHeight ?? 1));
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                  >
                    <span className={styles.unrackedDeviceName}>{device.name}</span>
                    <span className={styles.uHeight}>{device.uHeight ?? tmpl?.uHeight ?? 1}U</span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
