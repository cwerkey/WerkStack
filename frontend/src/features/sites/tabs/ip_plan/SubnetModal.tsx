import { useState, useEffect } from 'react';
import { useThemeStore, OS_THEME_TOKENS } from '../../../../store/useThemeStore';
import type { Subnet } from '@werkstack/shared';

const CIDR_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/;

interface Props {
  open:     boolean;
  initial?: Subnet | null;
  siteId:   string;
  onSave:   (s: Subnet) => void;
  onClose:  () => void;
}

export function SubnetModal({ open, initial, siteId, onSave, onClose }: Props) {
  const osTheme = useThemeStore(s => s.osTheme);
  const th      = OS_THEME_TOKENS[osTheme];

  const [cidr,    setCidr]    = useState('');
  const [name,    setName]    = useState('');
  const [vlan,    setVlan]    = useState('');
  const [gateway, setGateway] = useState('');
  const [notes,   setNotes]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (open) {
      setCidr(initial?.cidr    ?? '');
      setName(initial?.name    ?? '');
      setVlan(initial?.vlan    != null ? String(initial.vlan) : '');
      setGateway(initial?.gateway ?? '');
      setNotes(initial?.notes  ?? '');
      setError('');
    }
  }, [open, initial]);

  if (!open) return null;

  const cidrValid = CIDR_RE.test(cidr.trim());
  const nameValid = name.trim().length > 0;
  const canSave   = cidrValid && nameValid && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      const body = {
        cidr:    cidr.trim(),
        name:    name.trim(),
        vlan:    vlan ? parseInt(vlan, 10) : undefined,
        gateway: gateway.trim() || undefined,
        notes:   notes.trim()   || undefined,
      };
      const url    = initial ? `/api/sites/${siteId}/subnets/${initial.id}` : `/api/sites/${siteId}/subnets`;
      const method = initial ? 'PATCH' : 'POST';
      const res    = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'save failed');
      onSave(data as Subnet);
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
  const rowStyle: React.CSSProperties = { display: 'flex', gap: 10 };

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
          borderRadius: 8, width: 440, maxWidth: '90vw',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${th.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontFamily: th.fontMain, fontSize: 13, color: th.text }}>
            {initial ? 'edit subnet' : 'new subnet'}
          </span>
          <button style={{ color: th.text3, fontFamily: th.fontLabel, fontSize: 12 }} onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>name *</label>
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Management LAN" />
          </div>
          <div style={rowStyle}>
            <div style={{ flex: 2 }}>
              <label style={labelStyle}>CIDR *</label>
              <input
                style={{ ...inputStyle, borderColor: cidr && !cidrValid ? th.red : th.border2 }}
                value={cidr}
                onChange={e => setCidr(e.target.value)}
                placeholder="192.168.1.0/24"
              />
              {cidr && !cidrValid && (
                <div style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.red, marginTop: 3 }}>
                  invalid CIDR format
                </div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>VLAN</label>
              <input
                style={inputStyle}
                type="number" min="1" max="4094"
                value={vlan}
                onChange={e => setVlan(e.target.value)}
                placeholder="e.g. 10"
              />
            </div>
          </div>
          <div>
            <label style={labelStyle}>gateway</label>
            <input style={inputStyle} value={gateway} onChange={e => setGateway(e.target.value)} placeholder="e.g. 192.168.1.1" />
          </div>
          <div>
            <label style={labelStyle}>notes</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
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
          >{saving ? 'saving…' : initial ? 'save changes' : 'create subnet'}</button>
        </div>
      </div>
    </div>
  );
}
