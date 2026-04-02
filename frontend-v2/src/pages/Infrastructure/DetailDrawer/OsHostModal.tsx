import { useState, useEffect } from 'react';
import type { OsHost } from '@werkstack/shared';

// ─── Types ──────────────────────────────────────────────────────────────────

interface OsHostModalProps {
  open:       boolean;
  deviceId:   string;
  deviceName: string;
  initial?:   OsHost | null;
  onSubmit:   (body: Omit<OsHost, 'id' | 'orgId' | 'siteId' | 'createdAt'>) => void;
  onClose:    () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const OS_SUGGESTIONS = [
  'Ubuntu',
  'Debian',
  'CentOS',
  'RHEL',
  'Proxmox',
  'TrueNAS',
  'UnRAID',
  'Windows Server',
  'ESXi',
  'FreeBSD',
  'Alpine',
  'Arch Linux',
];

// ─── Styles ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '5px 10px', fontSize: 12, color: '#d4d9dd', background: '#0e1012',
  border: '1px solid #2a3038', borderRadius: 4, outline: 'none', width: '100%',
  boxSizing: 'border-box', fontFamily: 'Inter,system-ui,sans-serif',
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'Inter,system-ui,sans-serif', fontSize: 11, color: '#8a9299',
  marginBottom: 4, display: 'block',
};

const readonlyRowStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 4, background: '#0e1012',
  border: '1px solid #2a3038', color: '#5a6068', fontSize: 12,
  fontFamily: 'Inter,system-ui,sans-serif',
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

// ─── Component ───────────────────────────────────────────────────────────────

export function OsHostModal({
  open,
  deviceId,
  deviceName,
  initial,
  onSubmit,
  onClose,
}: OsHostModalProps) {
  const [hostOs,    setHostOs]    = useState('');
  const [osVersion, setOsVersion] = useState('');
  const [kernel,    setKernel]    = useState('');
  const [notes,     setNotes]     = useState('');

  // Reset / populate fields whenever the modal opens
  useEffect(() => {
    if (open) {
      setHostOs(initial?.hostOs    ?? '');
      setOsVersion(initial?.osVersion ?? '');
      setKernel(initial?.kernel    ?? '');
      setNotes(initial?.notes     ?? '');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  function handleSubmit() {
    if (!hostOs.trim()) return;
    onSubmit({
      deviceId,
      hostOs:    hostOs.trim(),
      osVersion: osVersion.trim() || undefined,
      kernel:    kernel.trim()    || undefined,
      notes:     notes.trim()     || undefined,
    });
  }

  const title = initial ? 'Edit Host OS' : 'Configure Host OS';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#161a1d', border: '1px solid #2a3038', borderRadius: 8,
          padding: 20, width: 440, display: 'flex', flexDirection: 'column', gap: 14,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 14, fontWeight: 600, color: '#d4d9dd' }}>
            {title}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: '#8a9299', fontSize: 18,
              cursor: 'pointer', lineHeight: 1, padding: '0 2px',
              fontFamily: 'Inter,system-ui,sans-serif',
            }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Device context row */}
        <div>
          <label style={labelStyle}>Device</label>
          <div style={readonlyRowStyle}>{deviceName}</div>
        </div>

        {/* OS Type */}
        <div>
          <label style={labelStyle}>OS Type *</label>
          <input
            style={inputStyle}
            type="text"
            list="os-type-suggestions"
            placeholder="e.g. Ubuntu"
            value={hostOs}
            onChange={e => setHostOs(e.target.value)}
            autoComplete="off"
          />
          <datalist id="os-type-suggestions">
            {OS_SUGGESTIONS.map(os => (
              <option key={os} value={os} />
            ))}
          </datalist>
        </div>

        {/* Version */}
        <div>
          <label style={labelStyle}>Version</label>
          <input
            style={inputStyle}
            type="text"
            placeholder="e.g. 22.04 LTS"
            value={osVersion}
            onChange={e => setOsVersion(e.target.value)}
          />
        </div>

        {/* Kernel */}
        <div>
          <label style={labelStyle}>Kernel</label>
          <input
            style={inputStyle}
            type="text"
            placeholder="e.g. 6.1.0-18-amd64"
            value={kernel}
            onChange={e => setKernel(e.target.value)}
          />
        </div>

        {/* Notes */}
        <div>
          <label style={labelStyle}>Notes</label>
          <textarea
            style={{ ...inputStyle, resize: 'vertical' }}
            rows={3}
            placeholder="Optional notes..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
          <button style={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button
            style={{ ...btnPrimary, opacity: hostOs.trim() ? 1 : 0.45, cursor: hostOs.trim() ? 'pointer' : 'not-allowed' }}
            onClick={handleSubmit}
            disabled={!hostOs.trim()}
          >
            {initial ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
