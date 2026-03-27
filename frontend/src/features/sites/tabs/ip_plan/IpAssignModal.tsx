import { useState, useEffect } from 'react';
import { useRackStore }        from '../../../../store/useRackStore';
import { useThemeStore, OS_THEME_TOKENS } from '../../../../store/useThemeStore';
import type { IpAssignment, Subnet } from '@werkstack/shared';

const IP_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

interface Props {
  open:     boolean;
  siteId:   string;
  subnet:   Subnet;
  initial?: IpAssignment | null;
  onSave:   (ip: IpAssignment) => void;
  onClose:  () => void;
}

export function IpAssignModal({ open, siteId, subnet, initial, onSave, onClose }: Props) {
  const osTheme = useThemeStore(s => s.osTheme);
  const th      = OS_THEME_TOKENS[osTheme];
  const devices = useRackStore(s => s.devices);

  const [ip,       setIp]       = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [label,    setLabel]    = useState('');
  const [notes,    setNotes]    = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    if (open) {
      setIp(initial?.ip         ?? '');
      setDeviceId(initial?.deviceId ?? '');
      setLabel(initial?.label   ?? '');
      setNotes(initial?.notes   ?? '');
      setError('');
    }
  }, [open, initial]);

  if (!open) return null;

  const ipValid = IP_RE.test(ip.trim());
  const canSave = ipValid && !saving;

  async function suggestNext() {
    setSuggesting(true);
    setError('');
    try {
      const res  = await fetch(`/api/sites/${siteId}/subnets/${subnet.id}/ips/next`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'suggestion failed');
      if (data.ip) {
        setIp(data.ip);
      } else {
        setError('subnet is full — no available IPs');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'suggestion failed');
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      const body = {
        ip:       ip.trim(),
        deviceId: deviceId || undefined,
        label:    label.trim() || undefined,
        notes:    notes.trim() || undefined,
      };
      const url    = initial
        ? `/api/sites/${siteId}/subnets/${subnet.id}/ips/${initial.id}`
        : `/api/sites/${siteId}/subnets/${subnet.id}/ips`;
      const method = initial ? 'PATCH' : 'POST';
      const res    = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'save failed');
      onSave(data as IpAssignment);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 10px', borderRadius: 4,
    border: `1px solid ${th.border2}`, background: th.inputBg,
    color: th.text, fontFamily: th.fontData, fontSize: 12,
    outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontFamily: th.fontLabel, fontSize: 10, color: th.text3, marginBottom: 4,
  };

  const assignedDevice = devices.find(d => d.id === deviceId);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: th.cardBg, border: `1px solid ${th.border2}`,
          borderRadius: 8, width: 420, maxWidth: '90vw',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${th.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <span style={{ fontFamily: th.fontMain, fontSize: 13, color: th.text }}>
              {initial ? 'edit IP assignment' : 'assign IP'}
            </span>
            <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3, marginLeft: 8 }}>
              {subnet.name} ({subnet.cidr})
            </span>
          </div>
          <button style={{ color: th.text3, fontFamily: th.fontLabel, fontSize: 12 }} onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* IP address */}
          <div>
            <label style={labelStyle}>IP address *</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                style={{
                  ...inputStyle,
                  flex: 1,
                  borderColor: ip && !ipValid ? th.red : th.border2,
                }}
                placeholder={`e.g. ${subnet.cidr.split('/')[0].replace(/\d+$/, '10')}`}
                value={ip}
                onChange={e => setIp(e.target.value)}
              />
              <button
                disabled={suggesting}
                style={{
                  padding: '6px 10px', borderRadius: 4, flexShrink: 0,
                  border: `1px solid ${th.border2}`, background: 'transparent',
                  color: th.text2, fontFamily: th.fontLabel, fontSize: 11, cursor: 'pointer',
                  opacity: suggesting ? 0.5 : 1,
                }}
                onClick={suggestNext}
              >{suggesting ? '…' : 'suggest'}</button>
            </div>
            {ip && !ipValid && (
              <div style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.red, marginTop: 3 }}>
                invalid IPv4 address
              </div>
            )}
          </div>

          {/* Device association */}
          <div>
            <label style={labelStyle}>assign to device (optional)</label>
            <select
              style={inputStyle}
              value={deviceId}
              onChange={e => setDeviceId(e.target.value)}
            >
              <option value="">— unassigned / reserved —</option>
              {devices.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Transfer notice */}
          {initial?.deviceId && deviceId && deviceId !== initial.deviceId && (
            <div style={{
              padding: '7px 10px', borderRadius: 4,
              background: `${th.gold}22`, border: `1px solid ${th.gold}`,
              fontFamily: th.fontLabel, fontSize: 11, color: th.gold,
            }}>
              ↔ transferring from {devices.find(d => d.id === initial.deviceId)?.name ?? 'unknown'}
              {assignedDevice ? ` to ${assignedDevice.name}` : ' to unassigned'}
            </div>
          )}

          {/* Label */}
          <div>
            <label style={labelStyle}>label (optional)</label>
            <input style={inputStyle} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. mgmt, web-01" />
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>notes (optional)</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: 48 }}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="optional notes"
            />
          </div>

          {error && (
            <div style={{ fontFamily: th.fontLabel, fontSize: 11, color: th.red }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px', borderTop: `1px solid ${th.border}`,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button
            style={{
              padding: '5px 14px', borderRadius: 4,
              border: `1px solid ${th.border2}`, background: 'transparent',
              color: th.text2, fontFamily: th.fontLabel, fontSize: 11, cursor: 'pointer',
            }}
            onClick={onClose}
          >cancel</button>
          <button
            disabled={!canSave}
            style={{
              padding: '5px 14px', borderRadius: 4,
              background: '#c47c5a', color: '#0c0d0e',
              border: '1px solid #c47c5a',
              fontFamily: th.fontLabel, fontSize: 11, cursor: 'pointer',
              opacity: canSave ? 1 : 0.4,
            }}
            onClick={handleSave}
          >{saving ? 'saving…' : initial ? 'save changes' : 'assign IP'}</button>
        </div>
      </div>
    </div>
  );
}
