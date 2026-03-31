import { useState, useEffect } from 'react';
import type { Connection, DeviceInstance, CableType } from '@werkstack/shared';

interface ConnectionEditModalProps {
  open: boolean;
  connection: Connection | null;
  devices: DeviceInstance[];
  cableTypes: CableType[];
  onSave: (updated: Connection) => void;
  onDelete: (connId: string) => void;
  onClose: () => void;
}

const inputStyle: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: 12,
  color: '#d4d9dd',
  background: '#0e1012',
  border: '1px solid #2a3038',
  borderRadius: 4,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'Inter,system-ui,sans-serif',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'Inter,system-ui,sans-serif',
  fontSize: 11,
  color: '#8a9299',
  marginBottom: 4,
  display: 'block',
};

const readonlyRowStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 4,
  background: '#0e1012',
  border: '1px solid #1e2428',
  color: '#8a9299',
  fontSize: 12,
  fontFamily: 'Inter,system-ui,sans-serif',
};

export function ConnectionEditModal({
  open,
  connection,
  devices,
  cableTypes,
  onSave,
  onDelete,
  onClose,
}: ConnectionEditModalProps) {
  const [cableTypeId, setCableTypeId] = useState('');
  const [cableLabel, setCableLabel] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open && connection) {
      setCableTypeId(connection.cableTypeId ?? '');
      setCableLabel(connection.label ?? '');
      setNotes(connection.notes ?? '');
    }
  }, [open, connection]);

  if (!open || !connection) return null;

  const srcDevice = devices.find(d => d.id === connection.srcDeviceId);
  const dstDevice = connection.dstDeviceId
    ? devices.find(d => d.id === connection.dstDeviceId)
    : null;

  const srcLabel = [srcDevice?.name, connection.srcPort].filter(Boolean).join(' : ');
  const dstLabel = connection.externalLabel
    ? `↗ ${connection.externalLabel}`
    : [dstDevice?.name, connection.dstPort].filter(Boolean).join(' : ');

  function handleSave() {
    onSave({
      ...connection!,
      cableTypeId: cableTypeId || undefined,
      label: cableLabel || undefined,
      notes: notes || undefined,
    });
  }

  function handleDelete() {
    if (!window.confirm('Remove this connection?')) return;
    onDelete(connection!.id);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: '#1a1e22',
          border: '1px solid #2a3038',
          borderRadius: 8,
          padding: '24px 28px',
          width: 420,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxSizing: 'border-box',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{
            fontFamily: 'Inter,system-ui,sans-serif', fontSize: 15, fontWeight: 600,
            color: '#d4d9dd', margin: 0,
          }}>
            Edit Connection
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#5a6068', fontSize: 18, lineHeight: 1, padding: '0 4px',
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Connection endpoints (read-only) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={readonlyRowStyle}>
            <span style={{ color: '#5a6068', fontSize: 10, marginRight: 6 }}>FROM</span>
            {srcLabel || '—'}
          </div>
          <div style={{ textAlign: 'center', color: '#3a4248', fontSize: 11 }}>↓</div>
          <div style={readonlyRowStyle}>
            <span style={{ color: '#5a6068', fontSize: 10, marginRight: 6 }}>TO</span>
            {dstLabel || '—'}
          </div>
        </div>

        {/* Cable type */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={labelStyle}>Cable Type</label>
          <select
            style={{ ...inputStyle, appearance: 'none', WebkitAppearance: 'none' }}
            value={cableTypeId}
            onChange={e => setCableTypeId(e.target.value)}
          >
            <option value="">— none —</option>
            {cableTypes.map(ct => (
              <option key={ct.id} value={ct.id}>{ct.name}</option>
            ))}
          </select>
        </div>

        {/* Label */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={labelStyle}>Cable Label <span style={{ color: '#3a4248' }}>(optional)</span></label>
          <input
            style={inputStyle}
            type="text"
            placeholder="e.g. uplink-01"
            value={cableLabel}
            onChange={e => setCableLabel(e.target.value)}
          />
        </div>

        {/* Notes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={labelStyle}>Notes <span style={{ color: '#3a4248' }}>(optional)</span></label>
          <textarea
            style={{
              ...inputStyle,
              minHeight: 54,
              resize: 'vertical',
              fontFamily: 'Inter,system-ui,sans-serif',
            }}
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
          <button
            style={{
              padding: '5px 12px', fontSize: 11,
              color: '#e8615a', background: 'none',
              border: '1px solid #e8615a44', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'Inter,system-ui,sans-serif',
            }}
            onClick={handleDelete}
          >
            Delete
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={{
                padding: '5px 14px', fontSize: 12, background: 'none',
                border: '1px solid #3a4248', borderRadius: 4,
                color: '#8a9299', cursor: 'pointer', fontFamily: 'Inter,system-ui,sans-serif',
              }}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              style={{
                padding: '5px 14px', fontSize: 12, background: '#c47c5a',
                border: 'none', borderRadius: 4, color: '#fff',
                cursor: 'pointer', fontFamily: 'Inter,system-ui,sans-serif', fontWeight: 600,
              }}
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
