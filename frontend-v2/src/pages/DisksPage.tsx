// /Users/calebwerkmeister/Documents/WerkStack/app/frontend-v2/src/pages/DisksPage.tsx
import React, { useState, useMemo } from 'react';
import type { Drive, DriveType, DriveInterfaceType } from '@werkstack/shared';
import { useGetSiteDrives, useGetSitePools, useCreateDrive } from '@/api/storage';
import { useGetDevices } from '@/api/devices';
import { useGetRacks } from '@/api/racks';
import { useSiteStore } from '@/stores/siteStore';
import FilterPills from '@/components/FilterPills';
import Skeleton from '@/components/Skeleton';
import QueryErrorState from '@/components/QueryErrorState';
import { ExportDropdown } from '@/components/ExportDropdown';
import { exportToCSV } from '@/utils/exportUtils';

// ── helpers ──────────────────────────────────────────────────────────────────

const DRIVE_TYPE_META: Record<DriveType, { label: string; bg: string; color: string }> = {
  hdd:   { label: 'HDD',   bg: '#1e3a5f', color: '#60a5fa' },
  ssd:   { label: 'SSD',   bg: '#14532d', color: '#22c55e' },
  nvme:  { label: 'NVMe',  bg: '#3b1f63', color: '#a78bfa' },
  flash: { label: 'Flash', bg: '#78350f', color: '#f59e0b' },
  tape:  { label: 'Tape',  bg: '#1f2937', color: '#9ca3af' },
};

function DriveTypeBadge({ driveType }: { driveType: DriveType }) {
  const { label, bg, color } = DRIVE_TYPE_META[driveType] ?? DRIVE_TYPE_META.hdd;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 'var(--radius-sm)',
      fontSize: 11,
      fontWeight: 700,
      background: bg,
      color,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }}>
      {label}
    </span>
  );
}

function BootBadge() {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 'var(--radius-sm)',
      fontSize: 10,
      fontWeight: 700,
      background: '#78350f',
      color: '#f59e0b',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    }}>
      Boot
    </span>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function DisksPage() {
  const currentSite = useSiteStore(s => s.currentSite);
  const siteId = currentSite?.id ?? '';

  const drivesQ = useGetSiteDrives(siteId);
  const { data: drives = [], isLoading: drivesLoading } = drivesQ;
  const { data: pools = [] } = useGetSitePools(siteId);
  const { data: devices = [] } = useGetDevices(siteId);
  const { data: racks = [] } = useGetRacks(siteId);
  const createDrive = useCreateDrive(siteId);

  const [sortCol, setSortCol] = useState<string>('model');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterRack, setFilterRack] = useState<string | null>(null);
  const [filterAssigned, setFilterAssigned] = useState<string | null>(null);
  const [addDiskOpen, setAddDiskOpen] = useState(false);
  const [newDisk, setNewDisk] = useState({
    label: '', model: '', capacity: '', serial: '',
    driveType: 'ssd' as DriveType,
    interfaceType: '' as DriveInterfaceType | '',
  });

  const poolMap = useMemo(() => new Map(pools.map(p => [p.id, p])), [pools]);
  const deviceMap = useMemo(() => new Map(devices.map(d => [d.id, d])), [devices]);
  const rackMap = useMemo(() => new Map(racks.map(r => [r.id, r])), [racks]);

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
  }

  function sortIndicator(col: string) {
    return sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  }

  const filtered = useMemo(() => {
    return drives.filter(d => {
      if (filterType && d.driveType !== filterType) return false;
      if (filterRack) {
        const dev = d.deviceId ? deviceMap.get(d.deviceId) : undefined;
        if (!dev || dev.rackId !== filterRack) return false;
      }
      if (filterAssigned === 'assigned' && !d.poolId) return false;
      if (filterAssigned === 'unassigned' && !!d.poolId) return false;
      return true;
    });
  }, [drives, filterType, filterRack, filterAssigned, deviceMap]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av = '';
      let bv = '';
      const devA = a.deviceId ? deviceMap.get(a.deviceId) : undefined;
      const devB = b.deviceId ? deviceMap.get(b.deviceId) : undefined;
      const rackA = devA?.rackId ? rackMap.get(devA.rackId)?.name ?? '' : '';
      const rackB = devB?.rackId ? rackMap.get(devB.rackId)?.name ?? '' : '';
      const poolA = a.poolId ? poolMap.get(a.poolId)?.name ?? '' : '';
      const poolB = b.poolId ? poolMap.get(b.poolId)?.name ?? '' : '';
      switch (sortCol) {
        case 'model':    av = a.model ?? '';     bv = b.model ?? '';     break;
        case 'capacity': av = a.capacity;        bv = b.capacity;        break;
        case 'serial':   av = a.serial ?? '';    bv = b.serial ?? '';    break;
        case 'type':     av = a.driveType;       bv = b.driveType;       break;
        case 'device':   av = devA?.name ?? '';  bv = devB?.name ?? '';  break;
        case 'rack':     av = rackA;             bv = rackB;             break;
        case 'pool':     av = poolA;             bv = poolB;             break;
        case 'boot':     av = String(a.isBoot);  bv = String(b.isBoot);  break;
        default:         av = a.model ?? '';     bv = b.model ?? '';
      }
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir, deviceMap, rackMap, poolMap]);

  function handleExportCsv() {
    const data = sorted.map(d => {
      const dev = d.deviceId ? deviceMap.get(d.deviceId) : undefined;
      const rack = dev?.rackId ? rackMap.get(dev.rackId)?.name ?? '' : '';
      const pool = d.poolId ? poolMap.get(d.poolId)?.name ?? '' : '';
      return {
        Model: d.model ?? '',
        Label: d.label ?? '',
        Capacity: d.capacity,
        Serial: d.serial ?? '',
        Type: d.driveType,
        Device: dev?.name ?? '',
        Rack: rack,
        Pool: pool,
        Boot: d.isBoot ? 'Yes' : 'No',
      };
    });
    exportToCSV(data, 'werkstack-disks.csv');
  }

  const pillGroups = [
    {
      key: 'type',
      label: 'Type',
      options: (['hdd', 'ssd', 'nvme', 'flash', 'tape'] as DriveType[]).map(t => ({
        value: t,
        label: DRIVE_TYPE_META[t].label,
      })),
      selected: filterType,
      onChange: setFilterType,
    },
    {
      key: 'rack',
      label: 'Rack',
      options: racks.map(r => ({ value: r.id, label: r.name })),
      selected: filterRack,
      onChange: setFilterRack,
    },
    {
      key: 'assigned',
      label: 'Pool',
      options: [
        { value: 'assigned',   label: 'Assigned' },
        { value: 'unassigned', label: 'Unassigned' },
      ],
      selected: filterAssigned,
      onChange: setFilterAssigned,
    },
  ];

  const thStyle: React.CSSProperties = {
    padding: '9px 12px',
    textAlign: 'left',
    fontWeight: 600,
    fontSize: 11,
    color: 'var(--color-text-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    whiteSpace: 'nowrap',
  };

  const tdStyle: React.CSSProperties = {
    padding: '9px 12px',
    color: 'var(--color-text)',
    fontSize: 13,
  };

  return (
    <div style={{ padding: '20px 24px', minHeight: '100%', background: 'var(--color-bg)' }}>
      <style>{`
        .tbl-row:hover { background: var(--color-hover) !important; }
        .sort-btn:hover { color: var(--color-text) !important; }
        .action-btn:hover { background: var(--color-accent) !important; color: var(--color-accent-text) !important; }
        .icon-btn:hover { background: var(--color-surface-2) !important; }
      `}</style>

      {drivesQ.error && <QueryErrorState error={drivesQ.error} onRetry={() => drivesQ.refetch()} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>Disks</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
            {drives.length} disk{drives.length !== 1 ? 's' : ''} across this site
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <ExportDropdown
            options={[
              { label: 'Export CSV', onSelect: handleExportCsv },
            ]}
            disabled={sorted.length === 0}
          />
          <button
            className="action-btn"
            onClick={() => {
              setNewDisk({ label: '', model: '', capacity: '', serial: '', driveType: 'ssd', interfaceType: '' });
              setAddDiskOpen(true);
            }}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid var(--color-accent)',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--color-accent)',
              cursor: 'pointer',
            }}
          >
            + Add Disk
          </button>
        </div>
      </div>

      {/* Filter Pills */}
      <FilterPills groups={pillGroups} style={{ marginBottom: 16 }} />

      {/* Table */}
      {drivesLoading ? (
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          padding: '20px 24px',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody><Skeleton variant="table-row" count={4} /></tbody>
          </table>
        </div>
      ) : sorted.length === 0 ? (
        <div style={{
          padding: 48,
          textAlign: 'center',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>💿</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>No disks yet</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Open a device in the Rack View to add a disk to the inventory.
          </div>
        </div>
      ) : (
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)' }}>
                <th style={thStyle}>
                  <button className="sort-btn" onClick={() => toggleSort('model')} style={sortBtnStyle}>
                    Model{sortIndicator('model')}
                  </button>
                </th>
                <th style={thStyle}>
                  <button className="sort-btn" onClick={() => toggleSort('capacity')} style={sortBtnStyle}>
                    Capacity{sortIndicator('capacity')}
                  </button>
                </th>
                <th style={thStyle}>
                  <button className="sort-btn" onClick={() => toggleSort('serial')} style={sortBtnStyle}>
                    Serial{sortIndicator('serial')}
                  </button>
                </th>
                <th style={thStyle}>
                  <button className="sort-btn" onClick={() => toggleSort('type')} style={sortBtnStyle}>
                    Type{sortIndicator('type')}
                  </button>
                </th>
                <th style={thStyle}>
                  <button className="sort-btn" onClick={() => toggleSort('device')} style={sortBtnStyle}>
                    Device{sortIndicator('device')}
                  </button>
                </th>
                <th style={thStyle}>
                  <button className="sort-btn" onClick={() => toggleSort('rack')} style={sortBtnStyle}>
                    Rack{sortIndicator('rack')}
                  </button>
                </th>
                <th style={thStyle}>
                  <button className="sort-btn" onClick={() => toggleSort('pool')} style={sortBtnStyle}>
                    Pool{sortIndicator('pool')}
                  </button>
                </th>
                <th style={thStyle}>
                  <button className="sort-btn" onClick={() => toggleSort('boot')} style={sortBtnStyle}>
                    Boot{sortIndicator('boot')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((drive, i) => {
                const dev = drive.deviceId ? deviceMap.get(drive.deviceId) : undefined;
                const rack = dev?.rackId ? rackMap.get(dev.rackId) : undefined;
                const pool = drive.poolId ? poolMap.get(drive.poolId) : undefined;
                const isLast = i === sorted.length - 1;

                return (
                  <tr
                    key={drive.id}
                    className="tbl-row"
                    style={{
                      borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
                      cursor: 'default',
                    }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      <div>{drive.model ?? <span style={{ color: 'var(--color-text-dim)' }}>Unknown</span>}</div>
                      {drive.label && (
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 1 }}>{drive.label}</div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                      {drive.capacity}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {drive.serial ?? '—'}
                    </td>
                    <td style={tdStyle}><DriveTypeBadge driveType={drive.driveType} /></td>
                    <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>{dev?.name ?? '—'}</td>
                    <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>{rack?.name ?? '—'}</td>
                    <td style={tdStyle}>
                      {pool ? (
                        <span>
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: pool.color, marginRight: 6, verticalAlign: 'middle' }} />
                          <span style={{ color: 'var(--color-text-muted)' }}>{pool.name}</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-dim)', fontSize: 11 }}>Unassigned</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {drive.isBoot ? <BootBadge /> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* Add Disk Modal */}
      {addDiskOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newDisk.capacity.trim()) return;
              createDrive.mutate(
                {
                  label: newDisk.label || undefined,
                  model: newDisk.model || undefined,
                  driveType: newDisk.driveType,
                  capacity: newDisk.capacity,
                  serial: newDisk.serial || undefined,
                  interfaceType: newDisk.interfaceType || undefined,
                  isBoot: false,
                },
                { onSuccess: () => setAddDiskOpen(false) },
              );
            }}
            style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 8, padding: 16, minWidth: 380, display: 'flex', flexDirection: 'column', gap: 12,
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>Add Disk to Inventory</div>

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={formLabelStyle}>Name</label>
                <input type="text" value={newDisk.label} onChange={e => setNewDisk(p => ({ ...p, label: e.target.value }))} placeholder="Optional" style={formInputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={formLabelStyle}>Model</label>
                <input type="text" value={newDisk.model} onChange={e => setNewDisk(p => ({ ...p, model: e.target.value }))} placeholder="Optional" style={formInputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={formLabelStyle}>Type</label>
                <select value={newDisk.driveType} onChange={e => setNewDisk(p => ({ ...p, driveType: e.target.value as DriveType }))} style={{ ...formInputStyle, cursor: 'pointer' }}>
                  <option value="hdd">HDD</option>
                  <option value="ssd">SSD</option>
                  <option value="nvme">NVMe</option>
                  <option value="flash">Flash</option>
                  <option value="tape">Tape</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={formLabelStyle}>Capacity *</label>
                <input type="text" value={newDisk.capacity} onChange={e => setNewDisk(p => ({ ...p, capacity: e.target.value }))} placeholder="e.g. 4T, 960G" style={formInputStyle} required />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={formLabelStyle}>Interface</label>
                <select value={newDisk.interfaceType} onChange={e => setNewDisk(p => ({ ...p, interfaceType: e.target.value as DriveInterfaceType | '' }))} style={{ ...formInputStyle, cursor: 'pointer' }}>
                  <option value="">—</option>
                  <option value="sata">SATA</option>
                  <option value="sas">SAS</option>
                  <option value="nvme">NVMe</option>
                  <option value="u2">U.2</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={formLabelStyle}>Serial</label>
                <input type="text" value={newDisk.serial} onChange={e => setNewDisk(p => ({ ...p, serial: e.target.value }))} placeholder="Optional" style={formInputStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" onClick={() => setAddDiskOpen(false)} style={{
                padding: '5px 14px', fontSize: 12, border: '1px solid var(--color-border)',
                borderRadius: 4, background: 'none', color: 'var(--color-text-muted)', cursor: 'pointer',
              }}>Cancel</button>
              <button type="submit" disabled={!newDisk.capacity.trim()} style={{
                padding: '5px 14px', fontSize: 12, fontWeight: 600, border: 'none',
                borderRadius: 4, background: 'var(--color-accent)', color: '#fff', cursor: 'pointer',
                opacity: newDisk.capacity.trim() ? 1 : 0.5,
              }}>Add Disk</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const formLabelStyle: React.CSSProperties = {
  fontSize: 10, color: 'var(--color-text-dim)', textTransform: 'uppercase',
  letterSpacing: '0.5px', display: 'block', marginBottom: 2,
};

const formInputStyle: React.CSSProperties = {
  width: '100%', padding: '5px 8px', fontSize: 12,
  background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
  borderRadius: 4, color: 'var(--color-text)', fontFamily: "'Inter', system-ui, sans-serif",
  boxSizing: 'border-box',
};

const sortBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'inherit',
  fontSize: 'inherit',
  fontWeight: 'inherit',
  padding: 0,
  letterSpacing: 'inherit',
  textTransform: 'inherit',
};
