import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetDevices, useUpdateDevice } from '@/api/devices';
import { useUpdateDeviceMonitor } from '@/api/activity';
import { useGetZones } from '@/api/zones';
import { useGetRacks } from '@/api/racks';
import { useGetDeviceTemplates } from '@/api/templates';
import { useSiteStore } from '@/stores/siteStore';
import { useTypesStore } from '@/stores/typesStore';
import { DeployWizard } from '@/wizards/DeployWizard';
import { ExportDropdown } from '@/components/ExportDropdown';
import { exportToCSV } from '@/utils/exportUtils';
import QueryErrorState from '@/components/QueryErrorState';
import type { DeviceInstance, Zone, Rack, DeviceTemplate } from '@werkstack/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = 'name' | 'type' | 'template' | 'rack' | 'zone' | 'rackU' | 'ip' | 'status';
type SortDir = 'asc' | 'desc';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Device Info Panel ────────────────────────────────────────────────────────

function DeviceInfoPanel({
  device,
  deviceTypes,
  templates,
  racks,
  zones,
  onSave,
  onMonitorUpdate,
}: {
  device: DeviceInstance;
  deviceTypes: { id: string; name: string; color: string }[];
  templates: DeviceTemplate[];
  racks: Rack[];
  zones: Zone[];
  onSave: (updated: Partial<DeviceInstance> & { id: string }) => void;
  onMonitorUpdate: (deviceId: string, enabled: boolean, ip: string | null, intervalS?: number) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(device.name);
  const [ip, setIp] = React.useState(device.ip ?? '');
  const [serial, setSerial] = React.useState(device.serial ?? '');
  const [assetTag, setAssetTag] = React.useState(device.assetTag ?? '');
  const [notes, setNotes] = React.useState(device.notes ?? '');

  React.useEffect(() => {
    setEditing(false);
    setName(device.name);
    setIp(device.ip ?? '');
    setSerial(device.serial ?? '');
    setAssetTag(device.assetTag ?? '');
    setNotes(device.notes ?? '');
  }, [device.id]);

  const devType = deviceTypes.find(t => t.id === device.typeId);
  const tpl = templates.find(t => t.id === device.templateId);
  const rack = racks.find(r => r.id === device.rackId);
  const zoneId = device.zoneId ?? rack?.zoneId;
  const zone = zones.find(z => z.id === zoneId);

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 16px', borderBottom: '1px solid #1e2328' }}>
      <span style={{ fontSize: 10, color: '#8a9299', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      <span style={{ fontSize: 13, color: '#d4d9dd' }}>{value}</span>
    </div>
  );

  const inputStyle: React.CSSProperties = {
    background: '#0e1012',
    border: '1px solid #2a3038',
    borderRadius: 4,
    padding: '4px 8px',
    fontSize: 12,
    color: '#d4d9dd',
    outline: 'none',
    width: '100%',
    fontFamily: 'Inter, system-ui, sans-serif',
    boxSizing: 'border-box',
  };

  if (editing) {
    return (
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: '#8a9299', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Name</div>
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#8a9299', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>IP Address</div>
            <input style={inputStyle} value={ip} onChange={e => setIp(e.target.value)} placeholder="e.g. 192.168.1.1" />
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#8a9299', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Serial</div>
            <input style={inputStyle} value={serial} onChange={e => setSerial(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#8a9299', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Asset Tag</div>
            <input style={inputStyle} value={assetTag} onChange={e => setAssetTag(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#8a9299', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Notes</div>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                onSave({
                  id: device.id,
                  name,
                  ip: ip || undefined,
                  serial: serial || undefined,
                  assetTag: assetTag || undefined,
                  notes: notes || undefined,
                });
                setEditing(false);
              }}
              style={{ background: '#c47c5a', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 12, color: '#fff', fontWeight: 500, cursor: 'pointer' }}
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              style={{ background: 'transparent', border: '1px solid #2a3038', borderRadius: 4, padding: '5px 12px', fontSize: 12, color: '#8a9299', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {row('Type', devType ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: devType.color, flexShrink: 0 }} />
          {devType.name}
        </span>
      ) : <span style={{ color: '#5a6068' }}>—</span>)}
      {row('Template', tpl
        ? `${tpl.manufacturer ?? ''} ${tpl.make} ${tpl.model}`.trim()
        : <span style={{ color: '#5a6068' }}>—</span>)}
      {row('Zone', zone?.name ?? <span style={{ color: '#5a6068' }}>—</span>)}
      {row('Rack', rack
        ? `${rack.name}${device.rackU != null ? ` · U${device.rackU}` : ''}`
        : <span style={{ color: '#5a6068' }}>Unassigned</span>)}
      {row('IP Address', device.ip ?? <span style={{ color: '#5a6068' }}>—</span>)}
      {row('Serial', device.serial ?? <span style={{ color: '#5a6068' }}>—</span>)}
      {row('Asset Tag', device.assetTag ?? <span style={{ color: '#5a6068' }}>—</span>)}
      {row('Notes', device.notes ?? <span style={{ color: '#5a6068' }}>—</span>)}
      {row('Status', (
        <span style={{
          padding: '2px 7px', borderRadius: 10, fontSize: 11,
          background: device.isDraft ? '#2a2018' : '#0e1f16',
          color: device.isDraft ? '#c4885a' : '#4caf7d',
          border: `1px solid ${device.isDraft ? '#4a3028' : '#1e4a30'}`,
          fontWeight: 500,
        }}>
          {device.isDraft ? 'Draft' : 'Active'}
        </span>
      ))}
      <div style={{ padding: '12px 16px' }}>
        <button
          onClick={() => setEditing(true)}
          style={{ background: '#c47c5a', border: 'none', borderRadius: 4, padding: '5px 14px', fontSize: 12, color: '#fff', fontWeight: 500, cursor: 'pointer' }}
        >
          Edit
        </button>
      </div>

      {/* Monitoring Section */}
      {!device.isDraft && (
        <MonitoringSection device={device} onMonitorUpdate={onMonitorUpdate} />
      )}
    </div>
  );
}

function MonitoringSection({
  device,
  onMonitorUpdate,
}: {
  device: DeviceInstance;
  onMonitorUpdate: (deviceId: string, enabled: boolean, ip: string | null, intervalS?: number) => void;
}) {
  const enabled = device.monitorEnabled ?? false;
  const [monitorIp, setMonitorIp] = React.useState(device.monitorIp ?? device.ip ?? '');
  const [intervalS, setIntervalS] = React.useState(device.monitorIntervalS ?? 60);
  const [showConfig, setShowConfig] = React.useState(false);

  React.useEffect(() => {
    setMonitorIp(device.monitorIp ?? device.ip ?? '');
    setIntervalS(device.monitorIntervalS ?? 60);
    setShowConfig(false);
  }, [device.id]);

  const toggleStyle: React.CSSProperties = {
    width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
    background: enabled ? '#22c55e' : '#3a4248',
    position: 'relative', transition: 'background 0.2s',
  };

  const dotStyle: React.CSSProperties = {
    width: 14, height: 14, borderRadius: '50%', background: '#fff',
    position: 'absolute', top: 3,
    left: enabled ? 19 : 3, transition: 'left 0.2s',
  };

  const inputStyle: React.CSSProperties = {
    background: '#0e1012', border: '1px solid #2a3038', borderRadius: 4,
    padding: '4px 8px', fontSize: 12, color: '#d4d9dd', outline: 'none',
    width: '100%', fontFamily: 'Inter, system-ui, sans-serif', boxSizing: 'border-box',
  };

  return (
    <div style={{ borderTop: '1px solid #2a3038', padding: '12px 16px' }}>
      <div style={{ fontSize: 10, color: '#8a9299', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
        Monitoring
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button
          style={toggleStyle}
          onClick={() => onMonitorUpdate(device.id, !enabled, monitorIp || null, intervalS)}
        >
          <span style={dotStyle} />
        </button>
        <span style={{ fontSize: 12, color: enabled ? '#22c55e' : '#8a9299' }}>
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
        {enabled && (
          <button
            onClick={() => setShowConfig(c => !c)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#8a9299', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
          >
            {showConfig ? 'Hide' : 'Configure'}
          </button>
        )}
      </div>

      {enabled && showConfig && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <div>
            <div style={{ fontSize: 10, color: '#8a9299', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
              Ping IP
            </div>
            <input
              style={inputStyle}
              value={monitorIp}
              onChange={e => setMonitorIp(e.target.value)}
              placeholder={device.ip ?? 'e.g. 192.168.1.1'}
            />
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#8a9299', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
              Interval (seconds)
            </div>
            <input
              style={{ ...inputStyle, width: 80 }}
              type="number"
              min={10}
              max={3600}
              value={intervalS}
              onChange={e => setIntervalS(Math.max(10, parseInt(e.target.value) || 10))}
            />
          </div>
          <button
            onClick={() => onMonitorUpdate(device.id, true, monitorIp || null, intervalS)}
            style={{ background: '#c47c5a', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 11, color: '#fff', fontWeight: 500, cursor: 'pointer', alignSelf: 'flex-start' }}
          >
            Save
          </button>
        </div>
      )}

      {enabled && !showConfig && device.currentStatus && (
        <div style={{ fontSize: 11, color: '#8a9299' }}>
          Status: <span style={{
            color: device.currentStatus === 'up' ? '#22c55e'
              : device.currentStatus === 'down' ? '#ef4444'
              : device.currentStatus === 'degraded' ? '#f59e0b' : '#6b7280',
            fontWeight: 500,
          }}>{device.currentStatus}</span>
          {device.monitorIp && <span> · {device.monitorIp}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DeviceLibrary() {
  const navigate = useNavigate();
  const siteId = useSiteStore(s => s.currentSite?.id ?? '');
  const deviceTypes = useTypesStore(s => s.deviceTypes);

  const devicesQ = useGetDevices(siteId);
  const { data: devices = [] } = devicesQ;
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
  const [selectedDevice, setSelectedDevice] = useState<DeviceInstance | null>(null);
  const updateDevice = useUpdateDevice(siteId);
  const updateMonitor = useUpdateDeviceMonitor(siteId);

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
    setSelectedDevice(d);
  }

  // ── Export CSV ───────────────────────────────────────────────────────────────
  function handleExportCsv() {
    const data = sorted.map(d => {
      const rack = rackMap.get(d.rackId ?? '');
      const zoneId = d.zoneId ?? rack?.zoneId;
      return {
        Name: d.name,
        Type: typeMap.get(d.typeId)?.name ?? '',
        Template: templateMap.get(d.templateId ?? '')?.model ?? '',
        Rack: rack?.name ?? '',
        Zone: zoneMap.get(zoneId ?? '')?.name ?? '',
        'U Position': d.rackU != null ? String(d.rackU) : '',
        IP: d.ip ?? '',
        Status: d.isDraft ? 'Draft' : 'Active',
      };
    });
    exportToCSV(data, 'werkstack-devices.csv');
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
      {devicesQ.error && <QueryErrorState error={devicesQ.error} onRetry={() => devicesQ.refetch()} />}

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
          <ExportDropdown
            options={[
              { label: 'Export CSV', onSelect: handleExportCsv },
            ]}
          />
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
                const rowBg = i % 2 === 0 ? 'transparent' : '#0e1012';

                return (
                  <tr
                    key={d.id}
                    className="dl-row clickable"
                    onClick={() => handleRowClick(d)}
                  >
                    <td
                      style={{
                        padding: '7px 12px',
                        borderBottom: '1px solid #1e2328',
                        background: rowBg,
                        color: '#d4d9dd',
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

      {/* Device Detail Panel */}
      {selectedDevice && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 400,
            background: '#1a1e22',
            borderLeft: '1px solid #2a3038',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 200,
            boxShadow: '-4px 0 16px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #2a3038', flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#d4d9dd', fontFamily: 'Inter, system-ui, sans-serif' }}>{selectedDevice.name}</span>
            <button
              onClick={() => setSelectedDevice(null)}
              style={{ background: 'none', border: 'none', color: '#8a9299', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0 }}
              title="Close"
            >&times;</button>
          </div>
          <DeviceInfoPanel
            device={selectedDevice}
            deviceTypes={deviceTypes}
            templates={templates}
            racks={racks}
            zones={zones}
            onSave={(updated) => {
              updateDevice.mutate(updated, {
                onSuccess: () => setSelectedDevice(s => s ? { ...s, ...updated } : s),
              });
            }}
            onMonitorUpdate={(deviceId, enabled, monitorIp, intervalS) => {
              updateMonitor.mutate(
                { deviceId, monitorEnabled: enabled, monitorIp, monitorIntervalS: intervalS },
                {
                  onSuccess: () => setSelectedDevice(s => s
                    ? { ...s, monitorEnabled: enabled, monitorIp, monitorIntervalS: intervalS }
                    : s),
                },
              );
            }}
          />
        </div>
      )}

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
