// /Users/calebwerkmeister/Documents/WerkStack/app/frontend-v2/src/pages/SubnetsPage.tsx
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Subnet, IpAssignment, DeviceInstance, Vlan, Rack } from '@werkstack/shared';
import {
  useGetSubnets,
  useCreateSubnet,
  useUpdateSubnet,
  useDeleteSubnet,
  useGetSiteIps,
} from '@/api/network';
import { useGetVlans } from '@/api/vlans';
import { useGetDevices } from '@/api/devices';
import { useGetRacks } from '@/api/racks';
import { useSiteStore } from '@/stores/siteStore';
import { uid } from '@/utils/uid';
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

// ── types ─────────────────────────────────────────────────────────────────────

interface SubnetFormState {
  id: string;
  cidr: string;
  name: string;
  vlan: string;
  gateway: string;
  notes: string;
}

function blankForm(): SubnetFormState {
  return { id: uid(), cidr: '', name: '', vlan: '', gateway: '', notes: '' };
}

function subnetToForm(s: Subnet): SubnetFormState {
  return {
    id: s.id,
    cidr: s.cidr,
    name: s.name,
    vlan: s.vlan != null ? String(s.vlan) : '',
    gateway: s.gateway ?? '',
    notes: s.notes ?? '',
  };
}

// ── SubnetFormPanel ───────────────────────────────────────────────────────────

interface SubnetFormPanelProps {
  initial?: Subnet;
  onSave: (data: SubnetFormState) => void;
  onCancel: () => void;
  saving: boolean;
}

function SubnetFormPanel({ initial, onSave, onCancel, saving }: SubnetFormPanelProps) {
  const [f, setF] = useState<SubnetFormState>(() =>
    initial ? subnetToForm(initial) : blankForm()
  );

  useEffect(() => {
    setF(initial ? subnetToForm(initial) : blankForm());
  }, [initial]);

  function set<K extends keyof SubnetFormState>(k: K, v: SubnetFormState[K]) {
    setF(p => ({ ...p, [k]: v }));
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text)',
    fontSize: 12,
    boxSizing: 'border-box',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--color-text-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 4,
  };

  const canSave = f.cidr.trim() !== '' && f.name.trim() !== '' && !saving;

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: '16px',
      marginBottom: 20,
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text)', marginBottom: 14 }}>
        {initial ? 'Edit Subnet' : 'New Subnet'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
        <div>
          <label style={labelStyle}>CIDR *</label>
          <input
            style={inputStyle}
            placeholder="e.g. 192.168.1.0/24"
            value={f.cidr}
            onChange={e => set('cidr', e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>Name *</label>
          <input
            style={inputStyle}
            placeholder="e.g. Management"
            value={f.name}
            onChange={e => set('name', e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>VLAN ID</label>
          <input
            style={inputStyle}
            placeholder="e.g. 10"
            type="number"
            min={1}
            max={4094}
            value={f.vlan}
            onChange={e => set('vlan', e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>Gateway</label>
          <input
            style={inputStyle}
            placeholder="e.g. 192.168.1.1"
            value={f.gateway}
            onChange={e => set('gateway', e.target.value)}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Notes</label>
          <input
            style={inputStyle}
            placeholder="Optional notes"
            value={f.notes}
            onChange={e => set('notes', e.target.value)}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        <button
          className="form-cancel-btn"
          onClick={onCancel}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            background: 'transparent',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          className="form-save-btn"
          onClick={() => canSave && onSave(f)}
          disabled={!canSave}
          style={{
            padding: '6px 16px',
            fontSize: 12,
            fontWeight: 600,
            border: '1px solid var(--color-accent)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-accent)',
            color: 'var(--color-accent-text)',
            cursor: canSave ? 'pointer' : 'not-allowed',
            opacity: canSave ? 1 : 0.5,
          }}
        >
          {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Subnet'}
        </button>
      </div>
    </div>
  );
}

// ── SubnetCard ────────────────────────────────────────────────────────────────

interface SubnetCardProps {
  subnet: Subnet;
  ips: IpAssignment[];
  deviceMap: Map<string, DeviceInstance>;
  rackMap: Map<string, Rack>;
  vlan: Vlan | undefined;
  onEdit: () => void;
  onDelete: () => void;
  navigate: ReturnType<typeof useNavigate>;
}

function SubnetCard({ subnet, ips, deviceMap, rackMap, vlan, onEdit, onDelete, navigate }: SubnetCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [menuOpen]);

  const subnetIps = useMemo(() => ips.filter(ip => ip.subnetId === subnet.id), [ips, subnet.id]);

  function handleIpClick(ip: IpAssignment) {
    if (!ip.deviceId) return;
    const dev = deviceMap.get(ip.deviceId);
    if (!dev) return;
    navigate(`/infrastructure/rack/${dev.zoneId ?? '_'}/${dev.rackId ?? '_'}/${dev.id}`);
  }

  return (
    <div
      className="subnet-card"
      style={{
        flex: '1 1 280px',
        minWidth: 280,
        maxWidth: 420,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: '12px 14px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--color-text)',
          }}>
            {subnet.cidr}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {subnet.vlan != null && (
              vlan ? (
                <span style={{
                  display: 'inline-block',
                  padding: '2px 7px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 10,
                  fontWeight: 700,
                  background: vlan.color,
                  color: '#fff',
                  letterSpacing: '0.04em',
                  textShadow: '0 1px 2px rgba(0,0,0,0.45)',
                  whiteSpace: 'nowrap',
                }}>
                  VLAN {subnet.vlan}
                </span>
              ) : (
                <span style={{
                  display: 'inline-block',
                  padding: '2px 7px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 10,
                  fontWeight: 600,
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-text-dim)',
                  border: '1px solid var(--color-border)',
                  whiteSpace: 'nowrap',
                }}>
                  VLAN {subnet.vlan}
                </span>
              )
            )}
            {/* ··· menu */}
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                className="card-menu-btn"
                onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-dim)',
                  fontSize: 16,
                  lineHeight: 1,
                  padding: '2px 5px',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                ···
              </button>
              {menuOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  zIndex: 200,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                  minWidth: 110,
                  overflow: 'hidden',
                }}>
                  <button
                    className="card-menu-item"
                    onClick={() => { setMenuOpen(false); onEdit(); }}
                    style={{
                      display: 'block', width: '100%', padding: '8px 14px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-text)', fontSize: 12, textAlign: 'left',
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="card-menu-item-danger"
                    onClick={() => { setMenuOpen(false); onDelete(); }}
                    style={{
                      display: 'block', width: '100%', padding: '8px 14px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-error)', fontSize: 12, textAlign: 'left',
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', marginBottom: 2 }}>
          {subnet.name}
        </div>
        {subnet.gateway && (
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>GW: {subnet.gateway}</div>
        )}
        {subnet.notes && (
          <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 3 }}>{subnet.notes}</div>
        )}
      </div>

      {/* IP rows */}
      {subnetIps.length > 0 ? (
        <div style={{ borderTop: '1px solid var(--color-border)' }}>
          {subnetIps.map(ip => {
            const dev = ip.deviceId ? deviceMap.get(ip.deviceId) : undefined;
            const rack = dev?.rackId ? rackMap.get(dev.rackId) : undefined;
            const isClickable = !!dev;
            const tooltipParts: string[] = [];
            if (dev) tooltipParts.push(dev.name);
            if (rack) tooltipParts.push(rack.name);
            if (dev?.rackU != null) tooltipParts.push(`U${dev.rackU}`);
            return (
              <div
                key={ip.id}
                className={isClickable ? 'ip-row-clickable' : 'ip-row'}
                title={tooltipParts.length ? tooltipParts.join(' · ') : undefined}
                onClick={() => { if (isClickable) handleIpClick(ip); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 14px',
                  borderTop: '1px solid var(--color-border)',
                  cursor: isClickable ? 'pointer' : 'default',
                }}
              >
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: 'var(--color-text)',
                  minWidth: 112,
                  flexShrink: 0,
                }}>
                  {ip.ip}
                </span>
                <span style={{
                  color: isClickable ? 'var(--color-accent)' : 'var(--color-text-dim)',
                  fontSize: 12,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {dev ? `→ ${dev.name}` : (ip.label ? ip.label : 'unassigned')}
                </span>
                {isClickable && (
                  <span style={{ fontSize: 10, color: 'var(--color-text-dim)', flexShrink: 0 }}>↗</span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{
          padding: '9px 14px',
          borderTop: '1px solid var(--color-border)',
          fontSize: 11,
          color: 'var(--color-text-dim)',
        }}>
          No IP assignments yet
        </div>
      )}
    </div>
  );
}

// ── SubnetsPage ───────────────────────────────────────────────────────────────

export default function SubnetsPage() {
  const currentSite = useSiteStore(s => s.currentSite);
  const siteId = currentSite?.id ?? '';
  const navigate = useNavigate();

  const { data: subnets = [], isLoading: subnetsLoading } = useGetSubnets(siteId);
  const { data: allIps = [] } = useGetSiteIps(siteId);
  const { data: vlans = [] } = useGetVlans(siteId);
  const { data: devices = [] } = useGetDevices(siteId);
  const { data: racks = [] } = useGetRacks(siteId);

  const createSubnet = useCreateSubnet(siteId);
  const updateSubnet = useUpdateSubnet(siteId);
  const deleteSubnet = useDeleteSubnet(siteId);

  const [showForm, setShowForm] = useState(false);
  const [editingSubnet, setEditingSubnet] = useState<Subnet | undefined>(undefined);

  const deviceMap = useMemo(() => new Map(devices.map(d => [d.id, d])), [devices]);
  const rackMap = useMemo(() => new Map(racks.map(r => [r.id, r])), [racks]);
  // Key: vlanId number → Vlan
  const vlanByVlanId = useMemo(() => new Map(vlans.map(v => [v.vlanId, v])), [vlans]);

  const saving = createSubnet.isPending || updateSubnet.isPending;

  function handleSave(f: SubnetFormState) {
    const payload = {
      cidr: f.cidr.trim(),
      name: f.name.trim(),
      ...(f.vlan.trim() !== '' ? { vlan: Number(f.vlan) } : {}),
      ...(f.gateway.trim() !== '' ? { gateway: f.gateway.trim() } : {}),
      ...(f.notes.trim() !== '' ? { notes: f.notes.trim() } : {}),
    };
    if (editingSubnet) {
      updateSubnet.mutate({ id: editingSubnet.id, ...payload }, {
        onSuccess: () => { setEditingSubnet(undefined); setShowForm(false); },
      });
    } else {
      createSubnet.mutate(payload, {
        onSuccess: () => setShowForm(false),
      });
    }
  }

  function handleDelete(subnet: Subnet) {
    if (!confirm(`Delete subnet "${subnet.cidr} — ${subnet.name}"?\nAll IP assignments in this subnet will also be removed.`)) return;
    deleteSubnet.mutate(subnet.id);
  }

  function handleExport() {
    const headers = ['IP', 'Device', 'Subnet CIDR', 'Subnet Name', 'VLAN', 'Gateway'];
    const rows = allIps.map(ip => {
      const subnet = subnets.find(s => s.id === ip.subnetId);
      const dev = ip.deviceId ? deviceMap.get(ip.deviceId) : undefined;
      return [
        ip.ip,
        dev?.name ?? '',
        subnet?.cidr ?? '',
        subnet?.name ?? '',
        subnet?.vlan != null ? String(subnet.vlan) : '',
        subnet?.gateway ?? '',
      ];
    });
    exportCsv('subnets.csv', headers, rows);
  }

  const formOpen = showForm || editingSubnet != null;

  return (
    <div style={{ padding: '20px 24px', minHeight: '100%', background: 'var(--color-bg)' }}>
      <style>{`
        .subnet-card:hover { border-color: var(--color-border-2) !important; }
        .ip-row-clickable:hover { background: var(--color-hover) !important; }
        .card-menu-btn:hover { background: var(--color-surface-2) !important; color: var(--color-text) !important; }
        .card-menu-item:hover { background: var(--color-hover) !important; }
        .card-menu-item-danger:hover { background: var(--color-error-tint) !important; }
        .action-btn:hover { background: var(--color-accent-dark) !important; border-color: var(--color-accent-dark) !important; }
        .icon-btn:hover { background: var(--color-surface-2) !important; color: var(--color-text) !important; }
        .form-save-btn:hover:not(:disabled) { background: var(--color-accent-dark) !important; border-color: var(--color-accent-dark) !important; }
        .form-cancel-btn:hover { background: var(--color-surface-2) !important; color: var(--color-text) !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>Subnets</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
            {subnets.length} subnet{subnets.length !== 1 ? 's' : ''} · {allIps.length} IP assignment{allIps.length !== 1 ? 's' : ''}
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
            onClick={() => {
              if (formOpen && !editingSubnet) {
                setShowForm(false);
              } else {
                setEditingSubnet(undefined);
                setShowForm(true);
              }
            }}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              border: '1px solid var(--color-accent)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-accent)',
              color: 'var(--color-accent-text)',
              cursor: 'pointer',
            }}
          >
            + Add Subnet
          </button>
        </div>
      </div>

      {/* Inline form */}
      {formOpen && (
        <SubnetFormPanel
          initial={editingSubnet}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingSubnet(undefined); }}
          saving={saving}
        />
      )}

      {/* Content */}
      {subnetsLoading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13 }}>
          Loading subnets…
        </div>
      ) : subnets.length === 0 ? (
        <div style={{
          padding: 48,
          textAlign: 'center',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🌐</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>No subnets yet</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Click "+ Add Subnet" to define your first network range.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
          {subnets.map(subnet => (
            <SubnetCard
              key={subnet.id}
              subnet={subnet}
              ips={allIps}
              deviceMap={deviceMap}
              rackMap={rackMap}
              vlan={subnet.vlan != null ? vlanByVlanId.get(subnet.vlan) : undefined}
              onEdit={() => { setEditingSubnet(subnet); setShowForm(false); }}
              onDelete={() => handleDelete(subnet)}
              navigate={navigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
