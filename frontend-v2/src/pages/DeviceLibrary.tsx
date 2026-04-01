import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetDevices } from '@/api/devices';
import { useGetZones } from '@/api/zones';
import { useGetRacks } from '@/api/racks';
import { useGetDeviceTemplates } from '@/api/templates';
import { useSiteStore } from '@/stores/siteStore';
import { useTypesStore } from '@/stores/typesStore';
import { DeployWizard } from '@/wizards/DeployWizard';
import type { DeviceInstance, Zone, Rack, DeviceTemplate } from '@werkstack/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'type' | 'template' | 'rack' | 'zone' | 'rackU' | 'ip' | 'status';
type SortDir = 'asc' | 'desc';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function strSort(a: string, b: string, dir: SortDir) {
  const cmp = a.localeCompare(b, undefined, { sensitivity: 'base' });
  return dir === 'asc' ? cmp : -cmp;
}

function numSort(a: number | undefined, b: number | undefined, dir: SortDir) {
  const av = a ?? -1;
  const bv = b ?? -1;
  return dir === 'asc' ? av - bv : bv - av;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface FilterPillProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function FilterPill({ label, active, onClick }: FilterPillProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 10px',
        borderRadius: 12,
        border: `1px solid ${active ? '#c47c5a' : '#2a3038'}`,
        background: active ? '#c47c5a15' : '#0e1012',
        color: active ? '#c47c5a' : '#8a9299',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'none',
      }}
    >
      {label}
    </button>
  );
}

interface ThProps {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  width?: string | number;
  align?: 'left' | 'right' | 'center';
}

function Th({ label, sortKey, currentKey, dir, onSort, width, align = 'left' }: ThProps) {
  const active = sortKey === currentKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        padding: '6px 12px',
        textAlign: align,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
        fontWeight: 500,
        color: active ? '#c47c5a' : '#8a9299',
        background: '#1a1e22',
        borderBottom: '1px solid #2a3038',
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        width: width ?? 'auto',
      }}
    >
      {label}
      {active && (
        <span style={{ marginLeft: 4, fontSize: 9 }}>
          {dir === 'asc' ? '▲' : '▼'}
        </span>
      )}
    </th>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DeviceLibrary() {
  const navigate = useNavigate();
  const siteId = useSiteStore(s => s.currentSite?.id ?? '');
  const deviceTypes = useTypesStore(s => s.deviceTypes);

  const { data: devices = [] } = useGetDevices(siteId);
  const { data: zones = [] } = useGetZones(siteId);
  const { data: racks = [] } = useGetRacks(siteId);
  const { data: templates = [] } = useGetDeviceTemplates();

  // ── UI state ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [zoneFilter, setZoneFilter] = useState<Set<string> | null>(null);
  const [typeFilter, setTypeFilter] = useState<Set<string> | null>(null);
  const [assignedFilter, setAssignedFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [deployOpen, setDeployOpen] = useState(false);

  // ── Lookup maps ─────────────────────────────────────────────────────────────
  const zoneMap = useMemo(() => new Map<string, Zone>(zones.map(z => [z.id, z])), [zones]);
  const rackMap = useMemo(() => new Map<string, Rack>(racks.map(r => [r.id, r])), [racks]);
  const templateMap = useMemo(() => new Map<string, DeviceTemplate>(templates.map(t => [t.id, t])), [templates]);
  const typeMap = useMemo(
    () => new Map(deviceTypes.map(dt => [dt.id, dt])),
    [deviceTypes],
  );

  // ── Sort handler ─────────────────────────────────────────────────────────────
  function handleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir('asc');
    }
  }

  // ── Filtering ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return devices.filter(d => {
      // Search
      if (q) {
        const haystack = [d.name, d.ip, d.serial, d.assetTag]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Zone filter
      const deviceZoneId = d.zoneId ?? (d.rackId ? rackMap.get(d.rackId)?.zoneId : undefined);
      if (zoneFilter !== null && deviceZoneId && !zoneFilter.has(deviceZoneId)) return false;
      if (zoneFilter !== null && !deviceZoneId) return false;

      // Type filter
      if (typeFilter !== null && !typeFilter.has(d.typeId)) return false;

      // Assigned/unassigned filter
      if (assignedFilter === 'assigned' && !d.rackId) return false;
      if (assignedFilter === 'unassigned' && !!d.rackId) return false;

      return true;
    });
  }, [devices, search, zoneFilter, typeFilter, assignedFilter, rackMap]);

  // ── Sorting ──────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'name': return strSort(a.name, b.name, sortDir);
        case 'type': return strSort(
          typeMap.get(a.typeId)?.name ?? '',
          typeMap.get(b.typeId)?.name ?? '',
          sortDir,
        );
        case 'template': return strSort(
          templateMap.get(a.templateId ?? '')?.model ?? '',
          templateMap.get(b.templateId ?? '')?.model ?? '',
          sortDir,
        );
        case 'rack': return strSort(
          rackMap.get(a.rackId ?? '')?.name ?? '',
          rackMap.get(b.rackId ?? '')?.name ?? '',
          sortDir,
        );
        case 'zone': {
          const azid = a.zoneId ?? (a.rackId ? rackMap.get(a.rackId)?.zoneId : undefined);
          const bzid = b.zoneId ?? (b.rackId ? rackMap.get(b.rackId)?.zoneId : undefined);
          return strSort(
            zoneMap.get(azid ?? '')?.name ?? '',
            zoneMap.get(bzid ?? '')?.name ?? '',
            sortDir,
          );
        }
        case 'rackU': return numSort(a.rackU, b.rackU, sortDir);
        case 'ip': return strSort(a.ip ?? '', b.ip ?? '', sortDir);
        case 'status': return strSort(
          a.isDraft ? 'Draft' : 'Active',
          b.isDraft ? 'Draft' : 'Active',
          sortDir,
        );
        default: return 0;
      }
    });
  }, [filtered, sortKey, sortDir, typeMap, templateMap, rackMap, zoneMap]);

  // ── Zone pill toggle ─────────────────────────────────────────────────────────
  function toggleZonePill(zoneId: string) {
    if (zoneFilter === null) {
      // Currently "all" — switch to all except this one
      const next = new Set(zones.map(z => z.id));
      next.delete(zoneId);
      setZoneFilter(next.size === 0 ? new Set<string>() : next);
    } else {
      const next = new Set(zoneFilter);
      if (next.has(zoneId)) {
        next.delete(zoneId);
      } else {
        next.add(zoneId);
        if (next.size === zones.length) {
          setZoneFilter(null);
          return;
        }
      }
      setZoneFilter(next);
    }
  }

  // ── Type pill toggle ─────────────────────────────────────────────────────────
  function toggleTypePill(typeId: string) {
    if (typeFilter === null) {
      const next = new Set(deviceTypes.map(t => t.id));
      next.delete(typeId);
      setTypeFilter(next.size === 0 ? new Set<string>() : next);
    } else {
      const next = new Set(typeFilter);
      if (next.has(typeId)) {
        next.delete(typeId);
      } else {
        next.add(typeId);
        if (next.size === deviceTypes.length) {
          setTypeFilter(null);
          return;
        }
      }
      setTypeFilter(next);
    }
  }

  // ── Row click ────────────────────────────────────────────────────────────────
  function handleRowClick(d: DeviceInstance) {
    if (!d.rackId) return;
    const rack = rackMap.get(d.rackId);
    const zoneId = rack?.zoneId ?? d.zoneId ?? '';
    navigate(`/infrastructure/rack/${zoneId}/${d.rackId}/${d.id}`);
  }

  // ── Export CSV ───────────────────────────────────────────────────────────────
  function handleExport() {
    const headers = ['Name', 'Type', 'Template', 'Rack', 'Zone', 'U Position', 'IP', 'Status'];
    const rows = sorted.map(d => {
      const rack = rackMap.get(d.rackId ?? '');
      const zoneId = d.zoneId ?? rack?.zoneId;
      return [
        d.name,
        typeMap.get(d.typeId)?.name ?? '',
        templateMap.get(d.templateId ?? '')?.model ?? '',
        rack?.name ?? '',
        zoneMap.get(zoneId ?? '')?.name ?? '',
        d.rackU != null ? String(d.rackU) : '',
        d.ip ?? '',
        d.isDraft ? 'Draft' : 'Active',
      ];
    });
    exportCsv('device-library.csv', headers, rows);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const thProps = { currentKey: sortKey, dir: sortDir, onSort: handleSort };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#d4d9dd',
      }}
    >
      <style>{`
        .dl-row:hover td { background: #1a1e22 !important; }
        .dl-row.clickable { cursor: pointer; }
        .dl-row.unclickable { cursor: default; }
        .dl-btn-primary:hover { background: #a8653e !important; }
        .dl-btn-secondary:hover { background: #222830 !important; }
      `}</style>

      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px 12px',
          borderBottom: '1px solid #2a3038',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#d4d9dd' }}>Device Library</div>
          <div style={{ fontSize: 12, color: '#8a9299', marginTop: 2 }}>
            {sorted.length} device{sorted.length !== 1 ? 's' : ''} visible
            {devices.length !== sorted.length ? ` of ${devices.length}` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="dl-btn-secondary"
            onClick={handleExport}
            style={{
              background: '#1a1e22',
              border: '1px solid #2a3038',
              borderRadius: 4,
              padding: '5px 12px',
              fontSize: 12,
              color: '#d4d9dd',
              cursor: 'pointer',
            }}
          >
            Export CSV
          </button>
          <button
            className="dl-btn-primary"
            onClick={() => setDeployOpen(true)}
            style={{
              background: '#c47c5a',
              border: 'none',
              borderRadius: 4,
              padding: '5px 14px',
              fontSize: 12,
              color: '#fff',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            + Deploy Device
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          padding: '10px 20px',
          borderBottom: '1px solid #2a3038',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, IP, serial, asset tag…"
          style={{
            background: '#0e1012',
            border: '1px solid #2a3038',
            borderRadius: 4,
            padding: '5px 10px',
            fontSize: 12,
            color: '#d4d9dd',
            outline: 'none',
            width: 220,
            fontFamily: 'inherit',
          }}
        />

        <div style={{ width: 1, height: 20, background: '#2a3038', margin: '0 4px' }} />

        {/* Zone pills */}
        <FilterPill
          label="all zones"
          active={zoneFilter === null}
          onClick={() => setZoneFilter(null)}
        />
        {zones.map(z => (
          <FilterPill
            key={z.id}
            label={z.name}
            active={zoneFilter === null || zoneFilter.has(z.id)}
            onClick={() => toggleZonePill(z.id)}
          />
        ))}

        <div style={{ width: 1, height: 20, background: '#2a3038', margin: '0 4px' }} />

        {/* Type pills */}
        <FilterPill
          label="all types"
          active={typeFilter === null}
          onClick={() => setTypeFilter(null)}
        />
        {deviceTypes.map(t => (
          <FilterPill
            key={t.id}
            label={t.name}
            active={typeFilter === null || typeFilter.has(t.id)}
            onClick={() => toggleTypePill(t.id)}
          />
        ))}

        <div style={{ width: 1, height: 20, background: '#2a3038', margin: '0 4px' }} />

        {/* Assigned toggle */}
        {(['all', 'assigned', 'unassigned'] as const).map(v => (
          <FilterPill
            key={v}
            label={v}
            active={assignedFilter === v}
            onClick={() => setAssignedFilter(v)}
          />
        ))}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {sorted.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 8,
              color: '#5a6068',
            }}
          >
            <div style={{ fontSize: 32 }}>📦</div>
            <div style={{ fontSize: 14 }}>No devices match the current filters</div>
          </div>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
            }}
          >
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <Th label="Name" sortKey="name" {...thProps} />
                <Th label="Type" sortKey="type" {...thProps} width={120} />
                <Th label="Template" sortKey="template" {...thProps} width={160} />
                <Th label="Zone" sortKey="zone" {...thProps} width={120} />
                <Th label="Rack" sortKey="rack" {...thProps} width={120} />
                <Th label="U" sortKey="rackU" {...thProps} width={60} align="center" />
                <Th label="IP Address" sortKey="ip" {...thProps} width={130} />
                <Th label="Status" sortKey="status" {...thProps} width={80} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((d, i) => {
                const rack = rackMap.get(d.rackId ?? '');
                const zoneId = d.zoneId ?? rack?.zoneId;
                const zone = zoneMap.get(zoneId ?? '');
                const tpl = templateMap.get(d.templateId ?? '');
                const devType = typeMap.get(d.typeId);
                const clickable = !!d.rackId;
                const rowBg = i % 2 === 0 ? 'transparent' : '#0e1012';

                return (
                  <tr
                    key={d.id}
                    className={`dl-row ${clickable ? 'clickable' : 'unclickable'}`}
                    onClick={() => handleRowClick(d)}
                  >
                    <td
                      style={{
                        padding: '7px 12px',
                        borderBottom: '1px solid #1e2328',
                        background: rowBg,
                        color: clickable ? '#d4d9dd' : '#8a9299',
                        fontWeight: 500,
                      }}
                    >
                      {d.name}
                    </td>
                    <td
                      style={{
                        padding: '7px 12px',
                        borderBottom: '1px solid #1e2328',
                        background: rowBg,
                        color: '#8a9299',
                        fontSize: 12,
                      }}
                    >
                      {devType ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: devType.color,
                              flexShrink: 0,
                            }}
                          />
                          {devType.name}
                        </span>
                      ) : (
                        <span style={{ color: '#5a6068' }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '7px 12px',
                        borderBottom: '1px solid #1e2328',
                        background: rowBg,
                        color: '#8a9299',
                        fontSize: 12,
                      }}
                    >
                      {tpl ? (
                        <span title={`${tpl.manufacturer ?? ''} ${tpl.make} ${tpl.model}`.trim()}>
                          {tpl.model}
                        </span>
                      ) : (
                        <span style={{ color: '#5a6068' }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '7px 12px',
                        borderBottom: '1px solid #1e2328',
                        background: rowBg,
                        color: '#8a9299',
                        fontSize: 12,
                      }}
                    >
                      {zone?.name ?? <span style={{ color: '#5a6068' }}>—</span>}
                    </td>
                    <td
                      style={{
                        padding: '7px 12px',
                        borderBottom: '1px solid #1e2328',
                        background: rowBg,
                        color: '#8a9299',
                        fontSize: 12,
                      }}
                    >
                      {rack?.name ?? <span style={{ color: '#5a6068' }}>Unassigned</span>}
                    </td>
                    <td
                      style={{
                        padding: '7px 12px',
                        borderBottom: '1px solid #1e2328',
                        background: rowBg,
                        color: '#8a9299',
                        fontSize: 12,
                        textAlign: 'center',
                      }}
                    >
                      {d.rackU != null ? `U${d.rackU}` : <span style={{ color: '#5a6068' }}>—</span>}
                    </td>
                    <td
                      style={{
                        padding: '7px 12px',
                        borderBottom: '1px solid #1e2328',
                        background: rowBg,
                        color: '#8a9299',
                        fontSize: 12,
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      {d.ip ?? <span style={{ color: '#5a6068', fontFamily: 'inherit' }}>—</span>}
                    </td>
                    <td
                      style={{
                        padding: '7px 12px',
                        borderBottom: '1px solid #1e2328',
                        background: rowBg,
                        fontSize: 11,
                      }}
                    >
                      <span
                        style={{
                          padding: '2px 7px',
                          borderRadius: 10,
                          background: d.isDraft ? '#2a2018' : '#0e1f16',
                          color: d.isDraft ? '#c4885a' : '#4caf7d',
                          border: `1px solid ${d.isDraft ? '#4a3028' : '#1e4a30'}`,
                          fontWeight: 500,
                        }}
                      >
                        {d.isDraft ? 'Draft' : 'Active'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Deploy Wizard */}
      <DeployWizard
        open={deployOpen}
        siteId={siteId}
        rackId={undefined}
        rackU={undefined}
        devices={devices}
        zones={zones}
        racks={racks}
        templates={templates}
        onClose={() => setDeployOpen(false)}
        onDeployed={(deviceId, rackId, zoneId) => {
          setDeployOpen(false);
          if (rackId && zoneId) {
            navigate(`/infrastructure/rack/${zoneId}/${rackId}/${deviceId}`);
          }
        }}
      />
    </div>
  );
}
