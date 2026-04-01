// /Users/calebwerkmeister/Documents/WerkStack/app/frontend-v2/src/pages/PoolsPage.tsx
import React, { useState, useMemo } from 'react';
import type { StoragePool, PoolType, PoolHealth, VdevGroup } from '@werkstack/shared';
import { useGetSitePools } from '@/api/storage';
import { useGetDevices } from '@/api/devices';
import { useGetRacks } from '@/api/racks';
import { useSiteStore } from '@/stores/siteStore';
import FilterPills from '@/components/FilterPills';
import Skeleton from '@/components/Skeleton';

// ── helpers ──────────────────────────────────────────────────────────────────

function exportCsv(filename: string, headers: string[], rows: string[][]) {
  const content = [headers, ...rows]
    .map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const HEALTH_COLORS: Record<PoolHealth, { bg: string; color: string }> = {
  online:   { bg: '#14532d',  color: '#22c55e' },
  degraded: { bg: '#78350f',  color: '#f59e0b' },
  faulted:  { bg: '#7f1d1d',  color: '#ef4444' },
  offline:  { bg: '#1f2937',  color: '#6b7280' },
  unknown:  { bg: '#1f2937',  color: '#6b7280' },
};

const POOL_TYPE_LABELS: Record<PoolType, string> = {
  zfs:   'ZFS',
  raid:  'RAID',
  ceph:  'Ceph',
  lvm:   'LVM',
  drive: 'Drive',
};

function HealthBadge({ health }: { health: PoolHealth }) {
  const { bg, color } = HEALTH_COLORS[health] ?? HEALTH_COLORS.unknown;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 'var(--radius-sm)',
      fontSize: 11,
      fontWeight: 600,
      background: bg,
      color,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }}>
      {health}
    </span>
  );
}

function VdevExpansion({ vdevGroups, driveCount }: { vdevGroups: VdevGroup[]; driveCount: number }) {
  if (!vdevGroups.length) {
    return (
      <div style={{ padding: '10px 16px 10px 40px', color: 'var(--color-text-dim)', fontSize: 12 }}>
        No vdev groups defined · {driveCount} drive{driveCount !== 1 ? 's' : ''}
      </div>
    );
  }
  return (
    <div style={{ padding: '10px 16px 10px 40px', background: 'var(--color-bg)' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        Vdev Layout
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {vdevGroups.map((vg, i) => (
          <div key={vg.id ?? i} style={{
            padding: '6px 12px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
          }}>
            <span style={{ color: 'var(--color-accent)', fontWeight: 600, marginRight: 6 }}>
              {vg.type.toUpperCase()}
            </span>
            {vg.label && (
              <span style={{ color: 'var(--color-text)', marginRight: 6 }}>{vg.label}</span>
            )}
            <span style={{ color: 'var(--color-text-muted)' }}>
              {vg.driveIds.length} drive{vg.driveIds.length !== 1 ? 's' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function PoolsPage() {
  const currentSite = useSiteStore(s => s.currentSite);
  const siteId = currentSite?.id ?? '';

  const { data: pools = [], isLoading: poolsLoading } = useGetSitePools(siteId);
  const { data: devices = [] } = useGetDevices(siteId);
  const { data: racks = [] } = useGetRacks(siteId);

  const [sortCol, setSortCol] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterRack, setFilterRack] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const deviceMap = useMemo(
    () => new Map(devices.map(d => [d.id, d])),
    [devices],
  );
  const rackMap = useMemo(
    () => new Map(racks.map(r => [r.id, r])),
    [racks],
  );

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
  }

  function sortIndicator(col: string) {
    return sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  }

  const filtered = useMemo(() => {
    return pools.filter(p => {
      if (filterType && p.poolType !== filterType) return false;
      if (filterRack) {
        const dev = deviceMap.get(p.deviceId);
        if (!dev || dev.rackId !== filterRack) return false;
      }
      return true;
    });
  }, [pools, filterType, filterRack, deviceMap]);

  const driveCountByPool = useMemo(() => {
    // We don't have drives loaded here, so compute from vdevGroups
    const m = new Map<string, number>();
    for (const p of pools) {
      const total = p.vdevGroups.reduce((acc, vg) => acc + vg.driveIds.length, 0);
      m.set(p.id, total);
    }
    return m;
  }, [pools]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av = '';
      let bv = '';
      const devA = deviceMap.get(a.deviceId);
      const devB = deviceMap.get(b.deviceId);
      const rackA = devA?.rackId ? rackMap.get(devA.rackId)?.name ?? '' : '';
      const rackB = devB?.rackId ? rackMap.get(devB.rackId)?.name ?? '' : '';
      switch (sortCol) {
        case 'name':     av = a.name;           bv = b.name;           break;
        case 'type':     av = a.poolType;        bv = b.poolType;       break;
        case 'device':   av = devA?.name ?? '';  bv = devB?.name ?? ''; break;
        case 'rack':     av = rackA;             bv = rackB;            break;
        case 'health':   av = a.health;          bv = b.health;         break;
        case 'drives':   av = String(driveCountByPool.get(a.id) ?? 0);
                         bv = String(driveCountByPool.get(b.id) ?? 0);  break;
        default:         av = a.name;            bv = b.name;
      }
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir, deviceMap, rackMap, driveCountByPool]);

  function handleExport() {
    const headers = ['Pool Name', 'Type', 'Device', 'Rack', 'Health', 'Drive Count', 'RAID Level'];
    const rows = sorted.map(p => {
      const dev = deviceMap.get(p.deviceId);
      const rack = dev?.rackId ? rackMap.get(dev.rackId)?.name ?? '' : '';
      return [
        p.name,
        p.poolType,
        dev?.name ?? '',
        rack,
        p.health,
        String(driveCountByPool.get(p.id) ?? 0),
        p.raidLevel,
      ];
    });
    exportCsv('pools.csv', headers, rows);
  }

  const pillGroups = [
    {
      key: 'type',
      label: 'Type',
      options: (['zfs', 'raid', 'ceph', 'lvm', 'drive'] as PoolType[]).map(t => ({
        value: t,
        label: POOL_TYPE_LABELS[t],
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
        .expand-row { background: var(--color-bg); }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>Storage Pools</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
            {pools.length} pool{pools.length !== 1 ? 's' : ''} across this site
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="icon-btn"
            onClick={handleExport}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
            }}
          >
            Export CSV
          </button>
          <button
            className="action-btn"
            onClick={() => alert('Select a device in the Rack View to create a pool')}
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
            + Create Pool
          </button>
        </div>
      </div>

      {/* Filter Pills */}
      <FilterPills groups={pillGroups} style={{ marginBottom: 16 }} />

      {/* Table */}
      {poolsLoading ? (
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
          <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>No pools yet</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Open a device in the Rack View to create a storage pool.
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
                {/* expand toggle col */}
                <th style={{ ...thStyle, width: 32 }} />
                <th style={thStyle}>
                  <button className="sort-btn" onClick={() => toggleSort('name')} style={sortBtnStyle}>
                    Pool Name{sortIndicator('name')}
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
                <th style={thStyle}>Capacity</th>
                <th style={thStyle}>
                  <button className="sort-btn" onClick={() => toggleSort('health')} style={sortBtnStyle}>
                    Health{sortIndicator('health')}
                  </button>
                </th>
                <th style={{ ...thStyle, textAlign: 'right' }}>
                  <button className="sort-btn" onClick={() => toggleSort('drives')} style={{ ...sortBtnStyle, textAlign: 'right' }}>
                    Drives{sortIndicator('drives')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((pool, i) => {
                const dev = deviceMap.get(pool.deviceId);
                const rack = dev?.rackId ? rackMap.get(dev.rackId) : undefined;
                const driveCount = driveCountByPool.get(pool.id) ?? 0;
                const isExpanded = expandedId === pool.id;
                const isLast = i === sorted.length - 1 && !isExpanded;

                return (
                  <React.Fragment key={pool.id}>
                    <tr
                      className="tbl-row"
                      onClick={() => setExpandedId(isExpanded ? null : pool.id)}
                      style={{
                        borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
                        cursor: 'pointer',
                      }}
                    >
                      {/* expand icon */}
                      <td style={{ ...tdStyle, width: 32, color: 'var(--color-text-dim)', fontSize: 10, paddingRight: 0 }}>
                        {isExpanded ? '▼' : '▶'}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: pool.color, marginRight: 8, verticalAlign: 'middle' }} />
                        {pool.name}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '2px 7px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: 11,
                          fontWeight: 600,
                          background: 'var(--color-surface-2)',
                          color: 'var(--color-accent)',
                          border: '1px solid var(--color-border)',
                        }}>
                          {POOL_TYPE_LABELS[pool.poolType]}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>{dev?.name ?? '—'}</td>
                      <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>{rack?.name ?? '—'}</td>
                      <td style={{ ...tdStyle, minWidth: 120 }}>
                        <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 3 }}>— / —</div>
                        <div style={{ height: 4, borderRadius: 2, background: 'var(--color-border)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: '0%', background: 'var(--color-accent)', borderRadius: 2 }} />
                        </div>
                      </td>
                      <td style={tdStyle}><HealthBadge health={pool.health} /></td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--color-text-muted)' }}>{driveCount}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="expand-row" style={{ borderBottom: i === sorted.length - 1 ? 'none' : '1px solid var(--color-border)' }}>
                        <td colSpan={8} style={{ padding: 0 }}>
                          <VdevExpansion vdevGroups={pool.vdevGroups} driveCount={driveCount} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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
