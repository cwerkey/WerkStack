import { useState } from 'react';
import type { Zone, Rack } from '@werkstack/shared';
import styles from './ZoneSidebar.module.css';

interface ZoneSidebarProps {
  zones: Zone[];
  racks: Rack[];
  selectedZoneId: string | null;
  selectedRackId: string | null;
  onZoneSelect: (zoneId: string) => void;
  onRackSelect: (rackId: string) => void;
}

export function ZoneSidebar({
  zones,
  racks,
  selectedZoneId,
  selectedRackId,
  onZoneSelect,
  onRackSelect,
}: ZoneSidebarProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(selectedZoneId ? [selectedZoneId] : []),
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
    </aside>
  );
}
