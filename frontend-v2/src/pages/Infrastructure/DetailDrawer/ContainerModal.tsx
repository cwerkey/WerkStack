import { useState, useEffect } from 'react';
import type { Container } from '@werkstack/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContainerModalProps {
  open: boolean;
  hostId: string;
  initial?: Container;
  onSubmit: (body: Omit<Container, 'id' | 'orgId' | 'siteId' | 'createdAt'>) => void;
  onClose: () => void;
}

interface PortRow {
  hostPort: number | '';
  containerPort: number | '';
  protocol: 'tcp' | 'udp';
}

interface VolumeRow {
  hostPath: string;
  containerPath: string;
  readOnly: boolean;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const panelStyle: React.CSSProperties = {
  background: '#161a1d',
  border: '1px solid #2a3038',
  borderRadius: 8,
  padding: 20,
  width: 500,
  maxHeight: '80vh',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

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

const btnPrimary: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: 12,
  fontWeight: 500,
  background: '#c47c5a',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'Inter,system-ui,sans-serif',
};

const btnGhost: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: 12,
  background: 'none',
  color: '#8a9299',
  border: '1px solid #2a3038',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'Inter,system-ui,sans-serif',
};

const addRowBtnStyle: React.CSSProperties = {
  appearance: 'none',
  background: 'none',
  border: '1px dashed #2a3038',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 11,
  color: '#5a6068',
  cursor: 'pointer',
  fontFamily: 'Inter,system-ui,sans-serif',
  textAlign: 'left',
};

const removeRowBtnStyle: React.CSSProperties = {
  appearance: 'none',
  background: 'none',
  border: 'none',
  color: '#5a6068',
  cursor: 'pointer',
  fontSize: 14,
  padding: '0 4px',
  fontFamily: 'Inter,system-ui,sans-serif',
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

const blankPort = (): PortRow => ({ hostPort: '', containerPort: '', protocol: 'tcp' });
const blankVolume = (): VolumeRow => ({ hostPath: '', containerPath: '', readOnly: false });

// ─── Component ───────────────────────────────────────────────────────────────

export function ContainerModal({ open, hostId, initial, onSubmit, onClose }: ContainerModalProps) {
  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [tag, setTag] = useState('latest');
  const [ports, setPorts] = useState<PortRow[]>([]);
  const [volumes, setVolumes] = useState<VolumeRow[]>([]);
  const [network, setNetwork] = useState('');
  const [restartPolicy, setRestartPolicy] = useState<Container['restartPolicy']>('no');
  const [notes, setNotes] = useState('');

  // Reset/populate state when modal opens
  useEffect(() => {
    if (open) {
      if (initial) {
        setName(initial.name);
        setImage(initial.image);
        setTag(initial.tag);
        setPorts(initial.ports.map(p => ({ hostPort: p.hostPort, containerPort: p.containerPort, protocol: p.protocol })));
        setVolumes(initial.volumes.map(v => ({ hostPath: v.hostPath, containerPath: v.containerPath, readOnly: v.readOnly })));
        setNetwork(initial.networks[0] ?? '');
        setRestartPolicy(initial.restartPolicy);
        setNotes(initial.notes ?? '');
      } else {
        setName('');
        setImage('');
        setTag('latest');
        setPorts([]);
        setVolumes([]);
        setNetwork('');
        setRestartPolicy('no');
        setNotes('');
      }
    }
  }, [open, initial]);

  if (!open) return null;

  // ── Port row handlers ──────────────────────────────────────────────────────

  function addPort() {
    setPorts(prev => [...prev, blankPort()]);
  }

  function updatePort(index: number, field: keyof PortRow, value: PortRow[keyof PortRow]) {
    setPorts(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
  }

  function removePort(index: number) {
    setPorts(prev => prev.filter((_, i) => i !== index));
  }

  // ── Volume row handlers ────────────────────────────────────────────────────

  function addVolume() {
    setVolumes(prev => [...prev, blankVolume()]);
  }

  function updateVolume(index: number, field: keyof VolumeRow, value: VolumeRow[keyof VolumeRow]) {
    setVolumes(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
  }

  function removeVolume(index: number) {
    setVolumes(prev => prev.filter((_, i) => i !== index));
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  function handleSubmit() {
    const validPorts = ports
      .filter(p => p.hostPort !== '' && p.containerPort !== '')
      .map(p => ({
        hostPort: Number(p.hostPort),
        containerPort: Number(p.containerPort),
        protocol: p.protocol,
      }));

    const validVolumes = volumes
      .filter(v => v.hostPath.trim() !== '' && v.containerPath.trim() !== '')
      .map(v => ({
        hostPath: v.hostPath.trim(),
        containerPath: v.containerPath.trim(),
        readOnly: v.readOnly,
      }));

    const networks = network.trim() ? [network.trim()] : [];

    onSubmit({
      hostId,
      name: name.trim(),
      image: image.trim(),
      tag: tag.trim() || 'latest',
      status: 'unknown',
      ports: validPorts,
      volumes: validVolumes,
      networks,
      restartPolicy,
      notes: notes.trim() || undefined,
    });
  }

  const canSubmit = name.trim() !== '' && image.trim() !== '';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Inter,system-ui,sans-serif', fontSize: 13, fontWeight: 600, color: '#d4d9dd' }}>
            {initial ? 'Edit Container' : 'Add Container'}
          </span>
          <button style={removeRowBtnStyle} onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* Name */}
        <div>
          <label style={labelStyle}>Name *</label>
          <input
            style={inputStyle}
            type="text"
            placeholder="e.g. nginx-proxy"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        {/* Image */}
        <div>
          <label style={labelStyle}>Image *</label>
          <input
            style={inputStyle}
            type="text"
            placeholder="e.g. nginx"
            value={image}
            onChange={e => setImage(e.target.value)}
          />
        </div>

        {/* Tag */}
        <div>
          <label style={labelStyle}>Tag</label>
          <input
            style={inputStyle}
            type="text"
            placeholder="latest"
            value={tag}
            onChange={e => setTag(e.target.value)}
          />
        </div>

        {/* Ports */}
        <div>
          <label style={labelStyle}>Ports</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ports.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  style={{ ...inputStyle, width: 80 }}
                  type="number"
                  placeholder="Host"
                  value={row.hostPort}
                  min={1}
                  max={65535}
                  onChange={e => updatePort(i, 'hostPort', e.target.value === '' ? '' : Number(e.target.value))}
                />
                <span style={{ color: '#5a6068', fontSize: 11, fontFamily: 'Inter,system-ui,sans-serif', flexShrink: 0 }}>:</span>
                <input
                  style={{ ...inputStyle, width: 80 }}
                  type="number"
                  placeholder="Container"
                  value={row.containerPort}
                  min={1}
                  max={65535}
                  onChange={e => updatePort(i, 'containerPort', e.target.value === '' ? '' : Number(e.target.value))}
                />
                <select
                  style={{ ...inputStyle, width: 70 }}
                  value={row.protocol}
                  onChange={e => updatePort(i, 'protocol', e.target.value as 'tcp' | 'udp')}
                >
                  <option value="tcp">tcp</option>
                  <option value="udp">udp</option>
                </select>
                <button style={removeRowBtnStyle} onClick={() => removePort(i)} aria-label="Remove port">×</button>
              </div>
            ))}
            <button style={addRowBtnStyle} onClick={addPort}>+ Add Port</button>
          </div>
        </div>

        {/* Volumes */}
        <div>
          <label style={labelStyle}>Volumes</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {volumes.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="Host path"
                  value={row.hostPath}
                  onChange={e => updateVolume(i, 'hostPath', e.target.value)}
                />
                <span style={{ color: '#5a6068', fontSize: 11, fontFamily: 'Inter,system-ui,sans-serif', flexShrink: 0 }}>:</span>
                <input
                  style={inputStyle}
                  type="text"
                  placeholder="Container path"
                  value={row.containerPath}
                  onChange={e => updateVolume(i, 'containerPath', e.target.value)}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, fontFamily: 'Inter,system-ui,sans-serif', fontSize: 11, color: '#8a9299', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={row.readOnly}
                    onChange={e => updateVolume(i, 'readOnly', e.target.checked)}
                    style={{ accentColor: '#c47c5a', cursor: 'pointer' }}
                  />
                  ro
                </label>
                <button style={removeRowBtnStyle} onClick={() => removeVolume(i)} aria-label="Remove volume">×</button>
              </div>
            ))}
            <button style={addRowBtnStyle} onClick={addVolume}>+ Add Volume</button>
          </div>
        </div>

        {/* Network */}
        <div>
          <label style={labelStyle}>Network</label>
          <input
            style={inputStyle}
            type="text"
            placeholder="e.g. bridge"
            value={network}
            onChange={e => setNetwork(e.target.value)}
          />
        </div>

        {/* Restart Policy */}
        <div>
          <label style={labelStyle}>Restart Policy</label>
          <select
            style={inputStyle}
            value={restartPolicy}
            onChange={e => setRestartPolicy(e.target.value as Container['restartPolicy'])}
          >
            <option value="no">no</option>
            <option value="always">always</option>
            <option value="on-failure">on-failure</option>
            <option value="unless-stopped">unless-stopped</option>
          </select>
        </div>

        {/* Notes */}
        <div>
          <label style={labelStyle}>Notes</label>
          <textarea
            style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
            placeholder="Optional notes…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 2 }}>
          <button style={btnGhost} onClick={onClose}>Cancel</button>
          <button
            style={{ ...btnPrimary, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {initial ? 'Save Changes' : 'Create Container'}
          </button>
        </div>
      </div>
    </div>
  );
}
