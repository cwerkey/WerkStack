// /Users/calebwerkmeister/Documents/WerkStack/app/frontend-v2/src/pages/LeasesPage.tsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { IpAssignment, Subnet, Vlan, DeviceInstance, Rack } from '@werkstack/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGetSiteIps, useGetSubnets, useCreateIpAssignment } from '@/api/network';
import { useGetVlans } from '@/api/vlans';
import { useGetDevices } from '@/api/devices';
import { useGetRacks } from '@/api/racks';
import { useSiteStore } from '@/stores/siteStore';
import { api } from '@/utils/api';
import { uid } from '@/utils/uid';
import FilterPills from '@/components/FilterPills';
import type { PillGroup } from '@/components/FilterPills';
import { useNavigate } from 'react-router-dom';

// ── helpers ───────────────────────────────────────────────────────────────────

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

// Natural sort for IPs
function compareIp(a: string, b: string): number {
  const toNum = (ip: string) => ip.split('.').map(n => Number(n).toString().padStart(3, '0')).join('');
  return toNum(a).localeCompare(toNum(b));
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

// ── AddIpForm ─────────────────────────────────────────────────────────────────

interface AddIpFormProps {
  subnets: Subnet[];
  siteId: string;
  onClose: () => void;
}

function AddIpForm({ subnets, siteId, onClose }: AddIpFormProps) {
  const [subnetId, setSubnetId] = useState(subnets[0]?.id ?? '');
  const [ip, setIp] = useState('');
  const [label, setLabel] = useState('');
  // Hook must be called at top level — always pass subnetId to satisfy rules of hooks
  const createIp = useCreateIpAssignment(siteId, subnetId);

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text)',
    fontSize: 12,
    outline: 'none',
  };

  function handleSave() {
    if (!subnetId || !ip.trim()) return;
    createIp.mutate(
      {
        subnetId,
        ip: ip.trim(),
        ...(label.trim() !== '' ? { label: label.trim() } : {}),
      },
      { onSuccess: () => onClose() }
    );
  }

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: '16px',
      marginBottom: 20,
      display: 'flex',
      flexWrap: 'wrap',
      gap: '10px 14px',
      alignItems: 'flex-end',
    }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          Subnet *
        </div>
        <select
          value={subnetId}
          onChange={e => setSubnetId(e.target.value)}
          style={{ ...inputStyle, minWidth: 180 }}
        >
          {subnets.map(s => (
            <option key={s.id} value={s.id}>{s.cidr} — {s.name}</option>
          ))}
        </select>
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          IP Address *
        </div>
        <input
          style={{ ...inputStyle, minWidth: 140 }}
          placeholder="e.g. 192.168.1.10"
          value={ip}
          onChange={e => setIp(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
        />
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          Label
        </div>
        <input
          style={{ ...inputStyle, minWidth: 160 }}
          placeholder="Optional label"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="form-cancel-btn"
          onClick={onClose}
          style={{
            padding: '6px 14px', fontSize: 12,
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
            background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          className="form-save-btn"
          onClick={handleSave}
          disabled={!subnetId || !ip.trim() || createIp.isPending}
          style={{
            padding: '6px 16px', fontSize: 12, fontWeight: 600,
            border: '1px solid var(--color-accent)', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-accent)', color: 'var(--color-accent-text)',
            cursor: !subnetId || !ip.trim() || createIp.isPending ? 'not-allowed' : 'pointer',
            opacity: !subnetId || !ip.trim() || createIp.isPending ? 0.5 : 1,
          }}
        >
          {createIp.isPending ? 'Saving…' : 'Assign IP'}
        </button>
      </div>
    </div>
  );
}

// ── InlineEditCell ────────────────────────────────────────────────────────────

interface InlineEditCellProps {
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
}

function InlineEditCell({ value, placeholder, onCommit }: InlineEditCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  }

  if (!editing) {
    return (
      <span
        className="inline-edit-trigger"
        onClick={() => { setDraft(value); setEditing(true); }}
        title="Click to edit"
        style={{
          cursor: 'text',
          color: value ? 'var(--color-text)' : 'var(--color-text-dim)',
          borderBottom: '1px dashed var(--color-border)',
          paddingBottom: 1,
          fontSize: 12,
        }}
      >
        {value || placeholder || '—'}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(value); } }}
      style={{
        padding: '2px 6px',
        background: 'var(--color-bg)',
        border: '1px solid var(--color-accent)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--color-text)',
        fontSize: 12,
        width: '100%',
        minWidth: 80,
        outline: 'none',
      }}
    />
  );
}

// ── LeasesPage ────────────────────────────────────────────────────────────────

export default function LeasesPage() {
  const currentSite = useSiteStore(s => s.currentSite);
  const siteId = currentSite?.id ?? '';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: allIps = [], isLoading: ipsLoading } = useGetSiteIps(siteId);
  const { data: subnets = [] } = useGetSubnets(siteId);
  const { data: vlans = [] } = useGetVlans(siteId);
  const { data: devices = [] } = useGetDevices(siteId);
  const { data: racks = [] } = useGetRacks(siteId);

  const [sortCol, setSortCol] = useState<string>('ip');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterRack, setFilterRack] = useState<string | null>(null);
  const [filterVlan, setFilterVlan] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const deviceMap = useMemo(() => new Map(devices.map(d => [d.id, d])), [devices]);
  const rackMap = useMemo(() => new Map(racks.map(r => [r.id, r])), [racks]);
  const subnetMap = useMemo(() => new Map(subnets.map(s => [s.id, s])), [subnets]);
  const vlanByVlanId = useMemo(() => new Map(vlans.map(v => [v.vlanId, v])), [vlans]);

  // Generic update mutation — calls PATCH for any IP by its subnetId
  const updateIp = useMutation({
    mutationFn: ({ subnetId, id, ...body }: { subnetId: string; id: string; label?: string; notes?: string }) =>
      api.patch<IpAssignment>(`/api/sites/${siteId}/subnets/${subnetId}/ips/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site-ips', siteId] });
      qc.invalidateQueries({ queryKey: ['subnet-ips', siteId] });
    },
  });

  // Generic delete mutation
  const deleteIp = useMutation({
    mutationFn: ({ subnetId, id }: { subnetId: string; id: string }) =>
      api.delete<void>(`/api/sites/${siteId}/subnets/${subnetId}/ips/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['site-ips', siteId] });
      qc.invalidateQueries({ queryKey: ['subnet-ips', siteId] });
    },
  });

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
  }

  function sortIndicator(col: string) {
    return sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  }

  const filtered = useMemo(() => {
    return allIps.filter(ip => {
      const dev = ip.deviceId ? deviceMap.get(ip.deviceId) : undefined;
      if (filterRack) {
        if (!dev || dev.rackId !== filterRack) return false;
      }
      if (filterVlan) {
        const subnet = subnetMap.get(ip.subnetId);
        if (!subnet || subnet.vlan == null || String(subnet.vlan) !== filterVlan) return false;
      }
      return true;
    });
  }, [allIps, filterRack, filterVlan, deviceMap, subnetMap]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const devA = a.deviceId ? deviceMap.get(a.deviceId) : undefined;
      const devB = b.deviceId ? deviceMap.get(b.deviceId) : undefined;
      const rackA = devA?.rackId ? rackMap.get(devA.rackId)?.name ?? '' : '';
      const rackB = devB?.rackId ? rackMap.get(devB.rackId)?.name ?? '' : '';
      const subA = subnetMap.get(a.subnetId);
      const subB = subnetMap.get(b.subnetId);
      const vlanA = subA?.vlan ?? 0;
      const vlanB = subB?.vlan ?? 0;

      let cmp = 0;
      switch (sortCol) {
        case 'ip':     cmp = compareIp(a.ip, b.ip); break;
        case 'device': cmp = (devA?.name ?? '').localeCompare(devB?.name ?? ''); break;
        case 'rack':   cmp = rackA.localeCompare(rackB); break;
        case 'vlan':   cmp = vlanA - vlanB; break;
        default:       cmp = compareIp(a.ip, b.ip);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir, deviceMap, rackMap, subnetMap]);

  function handleExport() {
    const headers = ['IP', 'Device', 'Rack', 'Subnet CIDR', 'VLAN', 'Label', 'Notes'];
    const rows = sorted.map(ip => {
      const dev = ip.deviceId ? deviceMap.get(ip.deviceId) : undefined;
      const rack = dev?.rackId ? rackMap.get(dev.rackId) : undefined;
      const subnet = subnetMap.get(ip.subnetId);
      const vlan = subnet?.vlan != null ? String(subnet.vlan) : '';
      return [ip.ip, dev?.name ?? '', rack?.name ?? '', subnet?.cidr ?? '', vlan, ip.label ?? '', ip.notes ?? ''];
    });
    exportCsv('leases.csv', headers, rows);
  }

  const pillGroups: PillGroup[] = [
    {
      key: 'rack',
      label: 'Rack',
      options: racks.map(r => ({ value: r.id, label: r.name })),
      selected: filterRack,
      onChange: setFilterRack,
    },
    {
      key: 'vlan',
      label: 'VLAN',
      options: vlans.map(v => ({ value: String(v.vlanId), label: `VLAN ${v.vlanId} — ${v.name}` })),
      selected: filterVlan,
      onChange: setFilterVlan,
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
    padding: '8px 12px',
    color: 'var(--color-text)',
    fontSize: 12,
  };

  return (
    <div style={{ padding: '20px 24px', minHeight: '100%', background: 'var(--color-bg)' }}>
      <style>{`
        .tbl-row:hover { background: var(--color-hover) !important; }
        .sort-btn:hover { color: var(--color-text) !important; }
        .action-btn:hover { background: var(--color-accent-dark) !important; border-color: var(--color-accent-dark) !important; }
        .icon-btn:hover { background: var(--color-surface-2) !important; color: var(--color-text) !important; }
        .form-save-btn:hover:not(:disabled) { background: var(--color-accent-dark) !important; border-color: var(--color-accent-dark) !important; }
        .form-cancel-btn:hover { background: var(--color-surface-2) !important; color: var(--color-text) !important; }
        .inline-edit-trigger:hover { border-bottom-color: var(--color-accent) !important; color: var(--color-text) !important; }
        .del-btn:hover { background: var(--color-error-tint) !important; color: var(--color-error) !important; }
        .nav-link:hover { color: var(--color-accent) !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>IP Leases</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
            {allIps.length} assignment{allIps.length !== 1 ? 's' : ''} across {subnets.length} subnet{subnets.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="icon-btn"
            onClick={handleExport}
            style={{
              padding: '6px 12px', fontSize: 12,
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface)', color: 'var(--color-text-muted)', cursor: 'pointer',
            }}
          >
            Export CSV
          </button>
          <button
            className="action-btn"
            onClick={() => setShowAddForm(f => !f)}
            style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 600,
              border: '1px solid var(--color-accent)', borderRadius: 'var(--radius-sm)',
              background: 'var(--color-accent)', color: 'var(--color-accent-text)', cursor: 'pointer',
            }}
          >
            + Assign IP
          </button>
        </div>
      </div>

      {/* Add IP form */}
      {showAddForm && subnets.length > 0 && (
        <AddIpForm subnets={subnets} siteId={siteId} onClose={() => setShowAddForm(false)} />
      )}
      {showAddForm && subnets.length === 0 && (
        <div style={{
          padding: '12px 16px', marginBottom: 16,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--color-text-muted)',
        }}>
          No subnets defined yet. Go to the Subnets page to create one first.
        </div>
      )}

      {/* Filter pills */}
      <FilterPills groups={pillGroups} style={{ marginBottom: 16 }} />

      {/* Table */}
      {ipsLoading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
          Loading IP assignments…
        </div>
      ) : sorted.length === 0 ? (
        <div style={{
          padding: 48, textAlign: 'center',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
            {allIps.length === 0 ? 'No IP assignments yet' : 'No results match your filters'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {allIps.length === 0
              ? 'Click "+ Assign IP" to track an address.'
              : 'Try clearing a filter above.'}
          </div>
        </div>
      ) : (
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)' }}>
                <th style={thStyle}>
                  <button className="sort-btn" onClick={() => toggleSort('ip')} style={sortBtnStyle}>
                    IP Address{sortIndicator('ip')}
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
                <th style={thStyle}>Subnet</th>
                <th style={thStyle}>
                  <button className="sort-btn" onClick={() => toggleSort('vlan')} style={sortBtnStyle}>
                    VLAN{sortIndicator('vlan')}
                  </button>
                </th>
                <th style={thStyle}>Label</th>
                <th style={thStyle}>Notes</th>
                <th style={{ ...thStyle, width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((ip, i) => {
                const dev = ip.deviceId ? deviceMap.get(ip.deviceId) : undefined;
                const rack = dev?.rackId ? rackMap.get(dev.rackId) : undefined;
                const subnet = subnetMap.get(ip.subnetId);
                const vlanNum = subnet?.vlan;
                const vlan = vlanNum != null ? vlanByVlanId.get(vlanNum) : undefined;
                const isLast = i === sorted.length - 1;

                return (
                  <tr
                    key={ip.id}
                    className="tbl-row"
                    style={{ borderBottom: isLast ? 'none' : '1px solid var(--color-border)' }}
                  >
                    <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                      {ip.ip}
                    </td>
                    <td style={tdStyle}>
                      {dev ? (
                        <span
                          className="nav-link"
                          onClick={() => navigate(`/infrastructure/rack/${dev.zoneId ?? '_'}/${dev.rackId ?? '_'}/${dev.id}`)}
                          style={{ cursor: 'pointer', color: 'var(--color-accent)', fontSize: 12 }}
                          title={rack ? `${rack.name}${dev.rackU != null ? ` U${dev.rackU}` : ''}` : undefined}
                        >
                          {dev.name}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-dim)' }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>
                      {rack?.name ?? '—'}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--color-text-muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                      {subnet?.cidr ?? ip.subnetId.slice(0, 8)}
                    </td>
                    <td style={tdStyle}>
                      {vlan ? (
                        <span style={{
                          display: 'inline-block',
                          padding: '1px 7px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: 10, fontWeight: 700,
                          background: vlan.color, color: '#fff',
                          textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                          whiteSpace: 'nowrap',
                        }}>
                          {vlanNum}
                        </span>
                      ) : vlanNum != null ? (
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{vlanNum}</span>
                      ) : (
                        <span style={{ color: 'var(--color-text-dim)' }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <InlineEditCell
                        value={ip.label ?? ''}
                        placeholder="add label"
                        onCommit={v =>
                          updateIp.mutate({ subnetId: ip.subnetId, id: ip.id, label: v })
                        }
                      />
                    </td>
                    <td style={tdStyle}>
                      <InlineEditCell
                        value={ip.notes ?? ''}
                        placeholder="add notes"
                        onCommit={v =>
                          updateIp.mutate({ subnetId: ip.subnetId, id: ip.id, notes: v })
                        }
                      />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', paddingRight: 8 }}>
                      <button
                        className="del-btn"
                        title="Delete assignment"
                        onClick={() => {
                          if (!confirm(`Remove IP assignment ${ip.ip}?`)) return;
                          deleteIp.mutate({ subnetId: ip.subnetId, id: ip.id });
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--color-text-dim)',
                          fontSize: 14,
                          padding: '2px 4px',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        ✕
                      </button>
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
