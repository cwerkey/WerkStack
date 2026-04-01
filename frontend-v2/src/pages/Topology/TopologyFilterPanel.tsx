import { useMemo } from 'react';
import type { DeviceInstance, Vlan } from '@werkstack/shared';
import { useGetRacks } from '@/api/racks';
import { useGetDevices } from '@/api/devices';
import { useGetVlans } from '@/api/vlans';
import { useGetTaxonomies, type Taxonomy } from '@/api/taxonomy';
import styles from './TopologyFilterPanel.module.css';

interface TopologyFilterPanelProps {
  siteId: string;
  rackFilter: Set<string> | null;
  onRackFilterChange: (f: Set<string> | null) => void;
  switchFilter: string | null;
  onSwitchFilterChange: (id: string | null) => void;
  vlanFilter: Set<number> | null;
  onVlanFilterChange: (f: Set<number> | null) => void;
}

type SwitchRole = 'core' | 'edge' | 'access' | 'unclassified';

const ROLE_ORDER: SwitchRole[] = ['core', 'edge', 'access'];

function isSwitchLike(d: DeviceInstance): boolean {
  return (
    d.typeId.startsWith('dt-switch') ||
    d.typeId.startsWith('dt-router') ||
    (d.switchRole != null && d.switchRole !== 'unclassified')
  );
}

export function TopologyFilterPanel({
  siteId,
  rackFilter,
  onRackFilterChange,
  switchFilter,
  onSwitchFilterChange,
  vlanFilter,
  onVlanFilterChange,
}: TopologyFilterPanelProps) {
  const { data: racks = [] } = useGetRacks(siteId);
  const { data: devices = [] } = useGetDevices(siteId);
  const { data: vlans = [] } = useGetVlans(siteId);
  const { data: taxonomies = [] } = useGetTaxonomies(siteId);

  // Build VLAN taxonomy color map: vlan id -> colorHex
  const vlanColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of taxonomies) {
      if (t.category === 'vlan') {
        map.set(t.referenceId, t.colorHex);
      }
    }
    return map;
  }, [taxonomies]);

  // Group switches by role
  const switchesByRole = useMemo(() => {
    const switches = devices.filter(isSwitchLike);
    const grouped: Record<SwitchRole, DeviceInstance[]> = {
      core: [],
      edge: [],
      access: [],
      unclassified: [],
    };
    for (const d of switches) {
      const role: SwitchRole = d.switchRole ?? 'unclassified';
      grouped[role].push(d);
    }
    return grouped;
  }, [devices]);

  // ── Rack filter handlers ─────────────────────────────────────────────────

  function handleRackAllToggle() {
    onRackFilterChange(rackFilter === null ? new Set() : null);
  }

  function handleRackToggle(rackId: string) {
    if (rackFilter === null) {
      // Currently "all" — switch to all-except-this
      const next = new Set(racks.map(r => r.id));
      next.delete(rackId);
      onRackFilterChange(next);
    } else {
      const next = new Set(rackFilter);
      if (next.has(rackId)) {
        next.delete(rackId);
      } else {
        next.add(rackId);
      }
      // If all racks are selected, collapse to null
      if (next.size === racks.length) {
        onRackFilterChange(null);
      } else {
        onRackFilterChange(next);
      }
    }
  }

  // ── Switch filter handlers ───────────────────────────────────────────────

  function handleSwitchClick(deviceId: string) {
    onSwitchFilterChange(switchFilter === deviceId ? null : deviceId);
  }

  // ── VLAN filter handlers ─────────────────────────────────────────────────

  function handleVlanAllToggle() {
    onVlanFilterChange(vlanFilter === null ? new Set() : null);
  }

  function handleVlanToggle(vlanId: number) {
    if (vlanFilter === null) {
      const next = new Set(vlans.map(v => v.vlanId));
      next.delete(vlanId);
      onVlanFilterChange(next);
    } else {
      const next = new Set(vlanFilter);
      if (next.has(vlanId)) {
        next.delete(vlanId);
      } else {
        next.add(vlanId);
      }
      if (next.size === vlans.length) {
        onVlanFilterChange(null);
      } else {
        onVlanFilterChange(next);
      }
    }
  }

  return (
    <div className={styles.panel}>
      {/* ── Racks ──────────────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Racks</div>
        {racks.length === 0 ? (
          <span className={styles.emptyHint}>No racks</span>
        ) : (
          <>
            <label className={styles.checkItem} onClick={handleRackAllToggle}>
              <input
                type="checkbox"
                checked={rackFilter === null}
                onChange={handleRackAllToggle}
              />
              All
            </label>
            {racks.map(rack => {
              const checked = rackFilter === null || rackFilter.has(rack.id);
              return (
                <label key={rack.id} className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleRackToggle(rack.id)}
                  />
                  {rack.name}
                </label>
              );
            })}
          </>
        )}
      </div>

      {/* ── Switches ───────────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Switches</div>
        {ROLE_ORDER.map(role => {
          const items = switchesByRole[role];
          if (items.length === 0) return null;
          return (
            <div key={role} className={styles.roleGroup}>
              <div className={styles.roleLabel}>{role}</div>
              {items.map(d => (
                <button
                  key={d.id}
                  className={switchFilter === d.id ? styles.switchItemActive : styles.switchItem}
                  onClick={() => handleSwitchClick(d.id)}
                >
                  {d.name}
                </button>
              ))}
            </div>
          );
        })}
        {switchesByRole.unclassified.length > 0 && (
          <div className={styles.roleGroup}>
            <div className={styles.roleLabel}>unclassified</div>
            {switchesByRole.unclassified.map(d => (
              <button
                key={d.id}
                className={switchFilter === d.id ? styles.switchItemActive : styles.switchItem}
                onClick={() => handleSwitchClick(d.id)}
              >
                {d.name}
              </button>
            ))}
          </div>
        )}
        {devices.filter(isSwitchLike).length === 0 && (
          <span className={styles.emptyHint}>No switches</span>
        )}
      </div>

      {/* ── VLANs ──────────────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>VLANs</div>
        {vlans.length === 0 ? (
          <span className={styles.emptyHint}>No VLANs</span>
        ) : (
          <>
            <label className={styles.checkItem} onClick={handleVlanAllToggle}>
              <input
                type="checkbox"
                checked={vlanFilter === null}
                onChange={handleVlanAllToggle}
              />
              All
            </label>
            {vlans.map(vlan => {
              const checked = vlanFilter === null || vlanFilter.has(vlan.vlanId);
              const color = vlanColorMap.get(vlan.id) ?? vlan.color ?? '#666';
              return (
                <label key={vlan.id} className={styles.checkItem}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleVlanToggle(vlan.vlanId)}
                  />
                  <span className={styles.colorDot} style={{ background: color }} />
                  {vlan.name} ({vlan.vlanId})
                </label>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
