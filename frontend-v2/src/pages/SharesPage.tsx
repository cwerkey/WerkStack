// /Users/calebwerkmeister/Documents/WerkStack/app/frontend-v2/src/pages/SharesPage.tsx
import React, { useState, useMemo } from 'react';
import type { Share, ShareProtocol, ShareAccessMode, PoolType } from '@werkstack/shared';
import { useGetSiteShares, useGetSitePools } from '@/api/storage';
import { useGetDevices } from '@/api/devices';
import { useGetRacks } from '@/api/racks';
import { useSiteStore } from '@/stores/siteStore';
import FilterPills from '@/components/FilterPills';
import Skeleton from '@/components/Skeleton';
import QueryErrorState from '@/components/QueryErrorState';
import { ExportDropdown } from '@/components/ExportDropdown';
import { exportToCSV } from '@/utils/exportUtils';

// ── helpers ──────────────────────────────────────────────────────────────────

const PROTOCOL_COLORS: Record<ShareProtocol, { bg: string; color: string }> = {
  smb:   { bg: '#1e3a5f', color: '#60a5fa' },
  nfs:   { bg: '#14532d', color: '#22c55e' },
  iscsi: { bg: '#3b1f63', color: '#a78bfa' },
};

const ACCESS_LABELS: Record<ShareAccessMode, string> = {
  public: 'Public',
  auth:   'Auth',
  list:   'List',
};

const POOL_TYPE_LABELS: Record<PoolType, string> = {
  zfs:   'ZFS',
  raid:  'RAID',
  ceph:  'Ceph',
  lvm:   'LVM',
  drive: 'Drive',
};

function ProtocolBadge({ protocol }: { protocol: ShareProtocol }) {
  const { bg, color } = PROTOCOL_COLORS[protocol] ?? { bg: '#1f2937', color: '#6b7280' };
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
      {protocol}
    </span>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function SharesPage() {
  const currentSite = useSiteStore(s => s.currentSite);
  const siteId = currentSite?.id ?? '';

  const sharesQ = useGetSiteShares(siteId);
  const { data: shares = [], isLoading: sharesLoading } = sharesQ;
  const { data: pools = [] } = useGetSitePools(siteId);
  const { data: devices = [] } = useGetDevices(siteId);
  const { data: racks = [] } = useGetRacks(siteId);

  const [sortCol, setSortCol] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterProtocol, setFilterProtocol] = useState<string | null>(null);
  const [filterPoolType, setFilterPoolType] = useState<string | null>(null);
  const [filterRack, setFilterRack] = useState<string | null>(null);

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

  // Derive device/rack from share → pool → device
  function getShareDevice(share: Share) {
    if (!share.poolId) return undefined;
    const pool = poolMap.get(share.poolId);
    if (!pool) return undefined;
    return deviceMap.get(pool.deviceId);
  }

  const filtered = useMemo(() => {
    return shares.filter(s => {
      if (filterProtocol && s.protocol !== filterProtocol) return false;
      if (filterPoolType) {
        const pool = s.poolId ? poolMap.get(s.poolId) : undefined;
        if (!pool || pool.poolType !== filterPoolType) return false;
      }
      if (filterRack) {
        const dev = getShareDevice(s);
        if (!dev || dev.rackId !== filterRack) return false;
      }
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shares, filterProtocol, filterPoolType, filterRack, poolMap, deviceMap]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av = '';
      let bv = '';
      const poolA = a.poolId ? poolMap.get(a.poolId) : undefined;
      const poolB = b.poolId ? poolMap.get(b.poolId) : undefined;
      const devA = getShareDevice(a);
      const devB = getShareDevice(b);
      const rackA = devA?.rackId ? rackMap.get(devA.rackId)?.name ?? '' : '';
      const rackB = devB?.rackId ? rackMap.get(devB.rackId)?.name ?? '' : '';
      switch (sortCol) {
        case 'name':       av = a.name;                  bv = b.name;                  break;
        case 'protocol':   av = a.protocol;               bv = b.protocol;              break;
        case 'pool':       av = poolA?.name ?? '';         bv = poolB?.name ?? '';       break;
        case 'device':     av = devA?.name ?? '';          bv = devB?.name ?? '';        break;
        case 'rack':       av = rackA;                    bv = rackB;                   break;
        case 'path':       av = a.path ?? '';             bv = b.path ?? '';            break;
        case 'access':     av = a.accessMode;             bv = b.accessMode;            break;
        default:           av = a.name;                  bv = b.name;
      }
      const cmp = av.localeCompare(bv, undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortCol, sortDir, poolMap, rackMap]);

  function handleExportCsv() {
    const data = sorted.map(s => {
      const pool = s.poolId ? poolMap.get(s.poolId) : undefined;
      const dev = getShareDevice(s);
      const rack = dev?.rackId ? rackMap.get(dev.rackId)?.name ?? '' : '';
      return {
        'Share Name': s.name,
        Protocol: s.protocol,
        Pool: pool?.name ?? '',
        Device: dev?.name ?? '',
        Rack: rack,
        Path: s.path ?? '',
        'Access Mode': s.accessMode,
      };
    });
    exportToCSV(data, 'werkstack-shares.csv');
  }

  const pillGroups = [
    {
      key: 'protocol',
      label: 'Protocol',
      options: (['smb', 'nfs', 'iscsi'] as ShareProtocol[]).map(p => ({
        value: p,
        label: p.toUpperCase(),
      })),
      selected: filterProtocol,
      onChange: setFilterProtocol,
    },
    {
      key: 'pooltype',
      label: 'Pool Type',
      options: (['zfs', 'raid', 'ceph', 'lvm', 'drive'] as PoolType[]).map(t => ({
        value: t,
        label: POOL_TYPE_LABELS[t],
      })),
      selected: filterPoolType,
      onChange: setFilterPoolType,
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
      `}</style>

      {sharesQ.error && <QueryErrorState error={sharesQ.error} onRetry={() => sharesQ.refetch()} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>Shares</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
            {shares.length} share{shares.length !== 1 ? 's' : ''} · SMB / NFS / iSCSI
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
            onClick={() => alert('Select a device in the Rack View to create a share')}
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
            + Create Share
          </button>
        </div>
      </div>

      {/* Filter Pills */}
      <FilterPills groups={pillGroups} style={{ marginBottom: 16 }} />

      {/* Table */}
      {sharesLoading ? (
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
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔗</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>No shares yet</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Open a device in the Rack View to configure a share.
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
                  <button className="sort-btn" onClick={() => toggleSort('name')} style={sortBtnStyle}>
                    Share Name{sortIndicator('name')}
                  </button>
                </th>
                <th style={thStyle}>
                  <button className="sort-btn" onClick={() => toggleSort('protocol')} style={sortBtnStyle}>
                    Protocol{sortIndicator('protocol')}
                  </button>
                </th>
                <th style={thStyle}>
                  <button className="sort-btn" onClick={() => toggleSort('pool')} style={sortBtnStyle}>
                    Pool{sortIndicator('pool')}
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
                  <button className="sort-btn" onClick={() => toggleSort('path')} style={sortBtnStyle}>
                    Path{sortIndicator('path')}
                  </button>
                </th>
                <th style={thStyle}>
                  <button className="sort-btn" onClick={() => toggleSort('access')} style={sortBtnStyle}>
                    Access{sortIndicator('access')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((share, i) => {
                const pool = share.poolId ? poolMap.get(share.poolId) : undefined;
                const dev = getShareDevice(share);
                const rack = dev?.rackId ? rackMap.get(dev.rackId) : undefined;
                const isLast = i === sorted.length - 1;

                return (
                  <tr
                    key={share.id}
                    className="tbl-row"
                    style={{
                      borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
                      cursor: 'default',
                    }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{share.name}</td>
                    <td style={tdStyle}><ProtocolBadge protocol={share.protocol} /></td>
                    <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>
                      {pool ? (
                        <>
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: pool.color, marginRight: 6, verticalAlign: 'middle' }} />
                          {pool.name}
                        </>
                      ) : '—'}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>{dev?.name ?? '—'}</td>
                    <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>{rack?.name ?? '—'}</td>
                    <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {share.path ?? '—'}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 7px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 11,
                        fontWeight: 500,
                        background: 'var(--color-surface-2)',
                        color: 'var(--color-text-muted)',
                        border: '1px solid var(--color-border)',
                      }}>
                        {ACCESS_LABELS[share.accessMode]}
                      </span>
                    </td>
                  </tr>
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
