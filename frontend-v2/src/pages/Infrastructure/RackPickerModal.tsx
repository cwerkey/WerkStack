import { useState } from 'react';
import type { Zone, Rack } from '@werkstack/shared';

interface RackPickerModalProps {
  open: boolean;
  zones: Zone[];
  racks: Rack[];
  currentRackId?: string;
  onConfirm: (rackId: string, rackU: number, face: 'front' | 'rear') => void;
  onClose: () => void;
}

export function RackPickerModal({ open, zones, racks, currentRackId, onConfirm, onClose }: RackPickerModalProps) {
  const [selectedZoneId, setSelectedZoneId] = useState<string>('');
  const [selectedRackId, setSelectedRackId] = useState<string>(currentRackId ?? '');
  const [rackU, setRackU] = useState<number>(1);
  const [face, setFace] = useState<'front' | 'rear'>('front');

  if (!open) return null;

  const zoneRacks = racks.filter(r => r.zoneId === selectedZoneId);
  const selectedRack = racks.find(r => r.id === selectedRackId);

  function handleConfirm() {
    if (!selectedRackId) return;
    onConfirm(selectedRackId, rackU, face);
  }

  const inputStyle: React.CSSProperties = {
    background: '#0e1012',
    border: '1px solid #2a3038',
    borderRadius: 4,
    padding: '5px 10px',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 12,
    color: '#d4d9dd',
    width: '100%',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 11,
    color: '#8a9299',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1a1e22',
          border: '1px solid #2a3038',
          borderRadius: 8,
          padding: '24px 28px',
          minWidth: 360,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 16, fontWeight: 600, color: '#d4d9dd' }}>
          Move to Rack
        </h2>

        <label style={labelStyle}>
          Zone
          <select
            style={inputStyle}
            value={selectedZoneId}
            onChange={e => { setSelectedZoneId(e.target.value); setSelectedRackId(''); }}
          >
            <option value="">— select zone —</option>
            {zones.map(z => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          Rack
          <select
            style={inputStyle}
            value={selectedRackId}
            onChange={e => setSelectedRackId(e.target.value)}
            disabled={!selectedZoneId}
          >
            <option value="">— select rack —</option>
            {zoneRacks.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          U Position
          <input
            type="number"
            style={inputStyle}
            min={1}
            max={selectedRack?.uHeight ?? 42}
            value={rackU}
            onChange={e => setRackU(parseInt(e.target.value, 10) || 1)}
          />
        </label>

        <label style={labelStyle}>
          Face
          <select style={inputStyle} value={face} onChange={e => setFace(e.target.value as 'front' | 'rear')}>
            <option value="front">Front</option>
            <option value="rear">Rear</option>
          </select>
        </label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8 }}>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid #3a4248',
              borderRadius: 4,
              padding: '6px 16px',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 12,
              color: '#8a9299',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedRackId}
            style={{
              background: selectedRackId ? 'var(--accent, #c47c5a)' : '#3a4248',
              border: 'none',
              borderRadius: 4,
              padding: '6px 16px',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: 12,
              color: selectedRackId ? '#fff' : '#5a6068',
              cursor: selectedRackId ? 'pointer' : 'not-allowed',
            }}
          >
            Move
          </button>
        </div>
      </div>
    </div>
  );
}
