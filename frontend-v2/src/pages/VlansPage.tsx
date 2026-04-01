// /Users/calebwerkmeister/Documents/WerkStack/app/frontend-v2/src/pages/VlansPage.tsx
import React, { useState, useMemo, useEffect } from 'react';
import type { Vlan, Subnet } from '@werkstack/shared';
import { useGetVlans, useCreateVlan, useUpdateVlan, useDeleteVlan } from '@/api/vlans';
import { useGetSubnets } from '@/api/network';
import { useSiteStore } from '@/stores/siteStore';
import { uid } from '@/utils/uid';
import Skeleton from '@/components/Skeleton';
import QueryErrorState from '@/components/QueryErrorState';
import { ExportDropdown } from '@/components/ExportDropdown';
import { exportToCSV } from '@/utils/exportUtils';

// ── types ─────────────────────────────────────────────────────────────────────

interface VlanFormState {
  id: string;
  vlanId: string;
  name: string;
  color: string;
  notes: string;
}

function blankVlanForm(): VlanFormState {
  return { id: uid(), vlanId: '', name: '', color: '#3b82f6', notes: '' };
}

function vlanToForm(v: Vlan): VlanFormState {
  return { id: v.id, vlanId: String(v.vlanId), name: v.name, color: v.color, notes: v.notes ?? '' };
}

// ── helpers ───────────────────────────────────────────────────────────────────

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

// ── VlanFormPanel ─────────────────────────────────────────────────────────────

interface VlanFormPanelProps {
  onSave: (f: VlanFormState) => void;
  onCancel: () => void;
  saving: boolean;
}

function VlanFormPanel({ onSave, onCancel, saving }: VlanFormPanelProps) {
  const [f, setF] = useState<VlanFormState>(blankVlanForm);

  // Reset on each mount (i.e. when form is opened)
  useEffect(() => { setF(blankVlanForm()); }, []);

  function set<K extends keyof VlanFormState>(k: K, v: VlanFormState[K]) {
    setF(p => ({ ...p, [k]: v }));
  }

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text)',
    fontSize: 12,
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

  const canSave = f.vlanId.trim() !== '' && f.name.trim() !== '' && !saving;

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
        <label style={labelStyle}>VLAN ID *</label>
        <input
          style={{ ...inputStyle, width: 90 }}
          type="number"
          min={1}
          max={4094}
          placeholder="e.g. 10"
          value={f.vlanId}
          onChange={e => set('vlanId', e.target.value)}
        />
      </div>
      <div>
        <label style={labelStyle}>Name *</label>
        <input
          style={{ ...inputStyle, minWidth: 180 }}
          placeholder="e.g. Management"
          value={f.name}
          onChange={e => set('name', e.target.value)}
        />
      </div>
      <div>
        <label style={labelStyle}>Color</label>
        <input
          type="color"
          value={f.color}
          onChange={e => set('color', e.target.value)}
          style={{ width: 40, height: 30, padding: 2, border: '1px solid var(--color-border)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', background: 'none' }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 160 }}>
        <label style={labelStyle}>Notes</label>
        <input
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          placeholder="Optional notes"
          value={f.notes}
          onChange={e => set('notes', e.target.value)}
        />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="form-cancel-btn"
          onClick={onCancel}
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
          onClick={() => canSave && onSave(f)}
          disabled={!canSave}
          style={{
            padding: '6px 16px', fontSize: 12, fontWeight: 600,
            border: '1px solid var(--color-accent)', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-accent)', color: 'var(--color-accent-text)',
            cursor: canSave ? 'pointer' : 'not-allowed',
            opacity: canSave ? 1 : 0.5,
          }}
        >
          {saving ? 'Saving…' : 'Create VLAN'}
        </button>
      </div>
    </div>
  );
}

// ── VlanRow ───────────────────────────────────────────────────────────────────

interface VlanRowProps {
  vlan: Vlan;
  subnets: Subnet[];
  onUpdateColor: (id: string, color: string) => void;
  onDelete: (id: string) => void;
  onSaveEdit: (f: VlanFormState) => void;
  isLast: boolean;
}

function VlanRow({ vlan, subnets, onUpdateColor, onDelete, onSaveEdit, isLast }: VlanRowProps) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<VlanFormState>(() => vlanToForm(vlan));

  // Keep local form in sync if vlan changes externally
  useEffect(() => {
    if (!editing) setF(vlanToForm(vlan));
  }, [vlan, editing]);

  function set<K extends keyof VlanFormState>(k: K, v: VlanFormState[K]) {
    setF(p => ({ ...p, [k]: v }));
  }

  const linkedSubnets = subnets.filter(s => s.vlan === vlan.vlanId);

  const tdStyle: React.CSSProperties = {
    padding: '9px 12px',
    color: 'var(--color-text)',
    fontSize: 12,
    verticalAlign: 'middle',
  };

  const inputStyle: React.CSSProperties = {
    padding: '4px 8px',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text)',
    fontSize: 12,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };

  if (editing) {
    return (
      <tr style={{ borderBottom: isLast ? 'none' : '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>
        {/* VLAN ID */}
        <td style={tdStyle}>
          <input
            style={{ ...inputStyle, width: 80 }}
            type="number"
            min={1}
            max={4094}
            value={f.vlanId}
            onChange={e => set('vlanId', e.target.value)}
          />
        </td>
        {/* Name */}
        <td style={tdStyle}>
          <input
            style={inputStyle}
            value={f.name}
            onChange={e => set('name', e.target.value)}
          />
        </td>
        {/* Color */}
        <td style={tdStyle}>
          <input
            type="color"
            value={f.color}
            onChange={e => set('color', e.target.value)}
            style={{ width: 40, height: 28, padding: 2, border: '1px solid var(--color-border)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', background: 'none' }}
          />
        </td>
        {/* Subnets (read-only in edit mode) */}
        <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>
          {linkedSubnets.map(s => s.cidr).join(', ') || '—'}
        </td>
        {/* Notes */}
        <td style={tdStyle}>
          <input
            style={inputStyle}
            value={f.notes}
            placeholder="Optional notes"
            onChange={e => set('notes', e.target.value)}
          />
        </td>
        {/* Actions */}
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              className="form-cancel-btn"
              onClick={() => { setEditing(false); setF(vlanToForm(vlan)); }}
              style={{
                padding: '4px 10px', fontSize: 11,
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              className="form-save-btn"
              onClick={() => { onSaveEdit(f); setEditing(false); }}
              disabled={!f.vlanId.trim() || !f.name.trim()}
              style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                border: '1px solid var(--color-accent)', borderRadius: 'var(--radius-sm)',
                background: 'var(--color-accent)', color: 'var(--color-accent-text)',
                cursor: !f.vlanId.trim() || !f.name.trim() ? 'not-allowed' : 'pointer',
                opacity: !f.vlanId.trim() || !f.name.trim() ? 0.5 : 1,
              }}
            >
              Save
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr
      className="tbl-row"
      style={{ borderBottom: isLast ? 'none' : '1px solid var(--color-border)' }}
    >
      {/* VLAN ID */}
      <td style={{ ...tdStyle, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
        {vlan.vlanId}
      </td>
      {/* Name */}
      <td style={{ ...tdStyle, fontWeight: 600 }}>{vlan.name}</td>
      {/* Color */}
      <td style={tdStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="color"
            value={vlan.color}
            onChange={e => onUpdateColor(vlan.id, e.target.value)}
            style={{ width: 32, height: 24, padding: 0, border: 'none', cursor: 'pointer', borderRadius: 4, background: 'none' }}
            title="Change VLAN color"
          />
          <span style={{
            display: 'inline-block',
            width: 48,
            height: 14,
            borderRadius: 3,
            background: vlan.color,
          }} />
        </div>
      </td>
      {/* Subnets */}
      <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>
        {linkedSubnets.length > 0
          ? linkedSubnets.map(s => (
              <span
                key={s.id}
                style={{
                  display: 'inline-block',
                  marginRight: 4,
                  padding: '1px 6px',
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {s.cidr}
              </span>
            ))
          : <span style={{ color: 'var(--color-text-dim)' }}>—</span>
        }
      </td>
      {/* Notes */}
      <td style={{ ...tdStyle, color: 'var(--color-text-muted)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {vlan.notes || <span style={{ color: 'var(--color-text-dim)' }}>—</span>}
      </td>
      {/* Actions */}
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button
            className="edit-btn"
            onClick={() => { setF(vlanToForm(vlan)); setEditing(true); }}
            style={{
              padding: '4px 10px', fontSize: 11,
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
              background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer',
            }}
          >
            Edit
          </button>
          <button
            className="del-btn"
            onClick={() => onDelete(vlan.id)}
            style={{
              padding: '4px 10px', fontSize: 11,
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
              background: 'transparent', color: 'var(--color-text-dim)', cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── VlansPage ─────────────────────────────────────────────────────────────────

export default function VlansPage() {
  const currentSite = useSiteStore(s => s.currentSite);
  const siteId = currentSite?.id ?? '';

  const vlansQ = useGetVlans(siteId);
  const { data: vlans = [], isLoading: vlansLoading } = vlansQ;
  const { data: subnets = [] } = useGetSubnets(siteId);

  const createVlan = useCreateVlan(siteId);
  const updateVlan = useUpdateVlan(siteId);
  const deleteVlan = useDeleteVlan(siteId);

  const [sortCol, setSortCol] = useState<string>('vlanId');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showForm, setShowForm] = useState(false);

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
  }

  function sortIndicator(col: string) {
    return sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  }

  const sorted = useMemo(() => {
    return [...vlans].sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case 'vlanId': cmp = a.vlanId - b.vlanId; break;
        case 'name':   cmp = a.name.localeCompare(b.name); break;
        default:       cmp = a.vlanId - b.vlanId;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [vlans, sortCol, sortDir]);

  function handleCreate(f: VlanFormState) {
    if (!f.vlanId.trim() || !f.name.trim()) return;
    createVlan.mutate({
      vlanId: Number(f.vlanId),
      name: f.name.trim(),
      color: f.color,
      ...(f.notes.trim() !== '' ? { notes: f.notes.trim() } : {}),
    }, {
      onSuccess: () => setShowForm(false),
    });
  }

  function handleSaveEdit(f: VlanFormState) {
    if (!f.vlanId.trim() || !f.name.trim()) return;
    updateVlan.mutate({
      id: f.id,
      vlanId: Number(f.vlanId),
      name: f.name.trim(),
      color: f.color,
      ...(f.notes.trim() !== '' ? { notes: f.notes.trim() } : { notes: undefined }),
    });
  }

  function handleUpdateColor(id: string, color: string) {
    updateVlan.mutate({ id, color });
  }

  function handleDelete(id: string) {
    const vlan = vlans.find(v => v.id === id);
    if (!confirm(`Delete VLAN ${vlan?.vlanId} "${vlan?.name}"?`)) return;
    deleteVlan.mutate(id);
  }

  function handleExportCsv() {
    const data = sorted.map(v => {
      const linked = subnets.filter(s => s.vlan === v.vlanId).map(s => s.cidr).join('; ');
      return {
        'VLAN ID': String(v.vlanId),
        Name: v.name,
        Color: v.color,
        Subnets: linked,
        Notes: v.notes ?? '',
      };
    });
    exportToCSV(data, 'werkstack-vlans.csv');
  }

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

  return (
    <div style={{ padding: '20px 24px', minHeight: '100%', background: 'var(--color-bg)' }}>
      <style>{`
        .tbl-row:hover { background: var(--color-hover) !important; }
        .sort-btn:hover { color: var(--color-text) !important; }
        .action-btn:hover { background: var(--color-accent-dark) !important; border-color: var(--color-accent-dark) !important; }
        .icon-btn:hover:not(:disabled) { background: var(--color-surface-2) !important; color: var(--color-text) !important; }
        .form-save-btn:hover:not(:disabled) { background: var(--color-accent-dark) !important; border-color: var(--color-accent-dark) !important; }
        .form-cancel-btn:hover { background: var(--color-surface-2) !important; color: var(--color-text) !important; }
        .edit-btn:hover { background: var(--color-surface-2) !important; color: var(--color-text) !important; border-color: var(--color-border-2) !important; }
        .del-btn:hover { background: var(--color-error-tint) !important; color: var(--color-error) !important; border-color: var(--color-error) !important; }
      `}</style>

      {vlansQ.error && <QueryErrorState error={vlansQ.error} onRetry={() => vlansQ.refetch()} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>VLANs</h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
            {vlans.length} VLAN{vlans.length !== 1 ? 's' : ''} defined for this site
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
            onClick={() => setShowForm(f => !f)}
            style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 600,
              border: '1px solid var(--color-accent)', borderRadius: 'var(--radius-sm)',
              background: 'var(--color-accent)', color: 'var(--color-accent-text)', cursor: 'pointer',
            }}
          >
            + Add VLAN
          </button>
        </div>
      </div>

      {/* Inline form */}
      {showForm && (
        <VlanFormPanel
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
          saving={createVlan.isPending}
        />
      )}

      {/* Table */}
      {vlansLoading ? (
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
          padding: 48, textAlign: 'center',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏷️</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>No VLANs yet</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Click "+ Add VLAN" to define your first VLAN.
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
                <th style={{ ...thStyle, width: 90 }}>
                  <button className="sort-btn" onClick={() => toggleSort('vlanId')} style={sortBtnStyle}>
                    VLAN ID{sortIndicator('vlanId')}
                  </button>
                </th>
                <th style={thStyle}>
                  <button className="sort-btn" onClick={() => toggleSort('name')} style={sortBtnStyle}>
                    Name{sortIndicator('name')}
                  </button>
                </th>
                <th style={{ ...thStyle, width: 100 }}>Color</th>
                <th style={thStyle}>Subnets</th>
                <th style={thStyle}>Notes</th>
                <th style={{ ...thStyle, width: 140, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((vlan, i) => (
                <VlanRow
                  key={vlan.id}
                  vlan={vlan}
                  subnets={subnets}
                  onUpdateColor={handleUpdateColor}
                  onDelete={handleDelete}
                  onSaveEdit={handleSaveEdit}
                  isLast={i === sorted.length - 1}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
