import { useState, useEffect } from 'react';
import type { Container, OsApp } from '@werkstack/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StackMonitorModalProps {
  open: boolean;
  item: Container | OsApp | null;
  kind: 'container' | 'app';
  onSave: (monitorEnabled: boolean, monitorIp: string | null, monitorIntervalS: number) => void;
  onClose: () => void;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const panelStyle: React.CSSProperties = {
  background: '#161a1d', border: '1px solid #2a3038', borderRadius: 8,
  padding: 20, width: 360, display: 'flex', flexDirection: 'column', gap: 14,
};

const inputStyle: React.CSSProperties = {
  padding: '5px 10px', fontSize: 12, color: '#d4d9dd', background: '#0e1012',
  border: '1px solid #2a3038', borderRadius: 4, outline: 'none', width: '100%',
  boxSizing: 'border-box', fontFamily: 'Inter,system-ui,sans-serif',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'Inter,system-ui,sans-serif', fontSize: 11, color: '#8a9299',
  marginBottom: 4, display: 'block',
};

const btnPrimary: React.CSSProperties = {
  padding: '6px 16px', fontSize: 12, fontWeight: 500, background: '#c47c5a',
  color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
  fontFamily: 'Inter,system-ui,sans-serif',
};

const btnGhost: React.CSSProperties = {
  padding: '6px 16px', fontSize: 12, background: 'none', color: '#8a9299',
  border: '1px solid #2a3038', borderRadius: 4, cursor: 'pointer',
  fontFamily: 'Inter,system-ui,sans-serif',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function StackMonitorModal({ open, item, kind, onSave, onClose }: StackMonitorModalProps) {
  const [enabled, setEnabled] = useState(false);
  const [ip, setIp] = useState('');
  const [interval, setInterval] = useState('60');

  useEffect(() => {
    if (open && item) {
      setEnabled(item.monitorEnabled ?? false);
      setIp(item.monitorIp ?? '');
      setInterval(String(item.monitorIntervalS ?? 60));
    }
  }, [open, item]);

  if (!open || !item) return null;

  function handleSave() {
    onSave(enabled, ip.trim() || null, parseInt(interval, 10) || 60);
  }

  const title = kind === 'container' ? 'Container Monitor Config' : 'App Monitor Config';

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 13, fontWeight: 600, color: '#d4d9dd' }}>
            {title}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8a9299', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
          >
            ×
          </button>
        </div>

        {/* Name */}
        <div style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 12, color: '#5a6068' }}>
          {item.name}
        </div>

        {/* Enabled toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'Inter,system-ui,sans-serif', fontSize: 12, color: '#d4d9dd' }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            style={{ accentColor: '#c47c5a', cursor: 'pointer' }}
          />
          Enable monitoring
        </label>

        {/* IP */}
        <div>
          <label style={labelStyle}>Ping IP</label>
          <input
            style={inputStyle}
            type="text"
            placeholder="e.g. 10.0.0.5"
            value={ip}
            onChange={e => setIp(e.target.value)}
          />
        </div>

        {/* Interval */}
        <div>
          <label style={labelStyle}>Interval (seconds)</label>
          <input
            style={inputStyle}
            type="number"
            min={10}
            max={3600}
            value={interval}
            onChange={e => setInterval(e.target.value)}
          />
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 2 }}>
          <button style={btnGhost} onClick={onClose}>Cancel</button>
          <button style={btnPrimary} onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
