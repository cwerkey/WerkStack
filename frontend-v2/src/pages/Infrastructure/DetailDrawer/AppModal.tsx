import { useState, useEffect } from 'react';
import type { OsApp, OsHost, OsVm } from '@werkstack/shared';

interface AppModalProps {
  open: boolean;
  host: OsHost | null;
  vms: OsVm[];
  initial?: OsApp;
  onSubmit: (body: Omit<OsApp, 'id' | 'orgId' | 'siteId' | 'createdAt'>) => void;
  onClose: () => void;
}

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

type ParentSelection = { type: 'host' | 'vm'; id: string } | '';

const APP_TYPE_SUGGESTIONS = [
  'at-web', 'at-proxy', 'at-monitoring', 'at-dns', 'at-vpn',
  'at-media', 'at-storage', 'at-database', 'at-gaming', 'at-automation',
];

export function AppModal({ open, host, vms, initial, onSubmit, onClose }: AppModalProps) {
  const [parent, setParent] = useState<ParentSelection>('');
  const [name, setName] = useState('');
  const [typeId, setTypeId] = useState('');
  const [version, setVersion] = useState('');
  const [ip, setIp] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      if (initial) {
        const p: ParentSelection = initial.vmId
          ? { type: 'vm', id: initial.vmId }
          : initial.hostId
            ? { type: 'host', id: initial.hostId }
            : '';
        setParent(p);
        setName(initial.name);
        setTypeId(initial.typeId ?? '');
        setVersion(initial.version ?? '');
        setIp(initial.ip ?? '');
        setUrl(initial.url ?? '');
        setNotes(initial.notes ?? '');
      } else {
        setParent('');
        setName('');
        setTypeId('');
        setVersion('');
        setIp('');
        setUrl('');
        setNotes('');
      }
    }
  }, [open, initial]);

  if (!open) return null;

  const canSubmit = name.trim() !== '' && parent !== '';

  function handleParentChange(value: string) {
    if (!value) {
      setParent('');
      return;
    }
    const [type, id] = value.split(':') as ['host' | 'vm', string];
    setParent({ type, id });
  }

  function getParentValue(): string {
    if (parent === '') return '';
    return `${parent.type}:${parent.id}`;
  }

  function handleSubmit() {
    if (!name.trim() || typeof parent === 'string') return;

    const body: Omit<OsApp, 'id' | 'orgId' | 'siteId' | 'createdAt'> = {
      name: name.trim(),
      typeId: typeId.trim(),
      extraIps: [],
      ...(parent.type === 'host' ? { hostId: parent.id } : { vmId: parent.id }),
      ...(version.trim() ? { version: version.trim() } : {}),
      ...(ip.trim() ? { ip: ip.trim() } : {}),
      ...(url.trim() ? { url: url.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    onSubmit(body);
  }

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
            {initial ? 'Edit Application' : 'Add Application'}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: '#8a9299', cursor: 'pointer',
              fontSize: 16, lineHeight: 1, padding: '0 2px', fontFamily: 'Inter,system-ui,sans-serif',
            }}
          >
            ×
          </button>
        </div>

        {/* Parent */}
        <div>
          <label style={labelStyle}>Parent *</label>
          <select
            value={getParentValue()}
            onChange={e => handleParentChange(e.target.value)}
            style={{ ...inputStyle, appearance: 'none' }}
          >
            <option value="">Select parent…</option>
            {host && (
              <option value={`host:${host.id}`}>Host: {host.hostOs}</option>
            )}
            {vms.map(vm => (
              <option key={vm.id} value={`vm:${vm.id}`}>VM: {vm.name}</option>
            ))}
          </select>
        </div>

        {/* Name */}
        <div>
          <label style={labelStyle}>Name *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            style={inputStyle}
            placeholder="e.g. Nginx"
          />
        </div>

        {/* App Type */}
        <div>
          <label style={labelStyle}>App Type</label>
          <input
            type="text"
            list="app-type-suggestions"
            value={typeId}
            onChange={e => setTypeId(e.target.value)}
            style={inputStyle}
            placeholder="e.g. at-web"
          />
          <datalist id="app-type-suggestions">
            {APP_TYPE_SUGGESTIONS.map(t => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>

        {/* Version */}
        <div>
          <label style={labelStyle}>Version</label>
          <input
            type="text"
            value={version}
            onChange={e => setVersion(e.target.value)}
            style={inputStyle}
            placeholder="e.g. 2.1.0"
          />
        </div>

        {/* Port / IP */}
        <div>
          <label style={labelStyle}>Port / IP</label>
          <input
            type="text"
            value={ip}
            onChange={e => setIp(e.target.value)}
            style={inputStyle}
            placeholder="e.g. 10.0.0.5:8080"
          />
        </div>

        {/* URL */}
        <div>
          <label style={labelStyle}>URL</label>
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            style={inputStyle}
            placeholder="e.g. https://app.local"
          />
        </div>

        {/* Notes */}
        <div>
          <label style={labelStyle}>Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
          <button style={btnGhost} onClick={onClose}>Cancel</button>
          <button
            style={{ ...btnPrimary, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {initial ? 'Save Changes' : 'Create App'}
          </button>
        </div>
      </div>
    </div>
  );
}
