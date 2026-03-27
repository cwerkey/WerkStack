import { useState, useEffect } from 'react';
import type { OsHost, DeviceInstance } from '@werkstack/shared';
import type { OsThemeTokens } from '../../../../store/useThemeStore';

interface Props {
  open:      boolean;
  initial?:  OsHost | null;
  devices:   DeviceInstance[];
  th:        OsThemeTokens;
  accent:    string;
  onSave:    (data: Omit<OsHost, 'id' | 'orgId' | 'siteId' | 'createdAt'>) => Promise<void>;
  onClose:   () => void;
}

const blank = { deviceId: '', hostOs: '', osVersion: '', kernel: '', notes: '' };

export function HostEditorModal({ open, initial, devices, th, accent, onSave, onClose }: Props) {
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setErr('');
      setF(initial
        ? { deviceId: initial.deviceId, hostOs: initial.hostOs, osVersion: initial.osVersion ?? '', kernel: initial.kernel ?? '', notes: initial.notes ?? '' }
        : { ...blank }
      );
    }
  }, [open]);

  const set = (k: keyof typeof blank, v: string) => setF(p => ({ ...p, [k]: v }));

  if (!open) return null;

  async function handleSave() {
    if (!f.deviceId) { setErr('select a device'); return; }
    if (!f.hostOs.trim()) { setErr('host OS is required'); return; }
    setSaving(true);
    try {
      await onSave({
        deviceId:  f.deviceId,
        hostOs:    f.hostOs.trim(),
        osVersion: f.osVersion.trim() || undefined,
        kernel:    f.kernel.trim() || undefined,
        notes:     f.notes.trim() || undefined,
      });
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: '100%', padding: '5px 10px', borderRadius: 4,
    border: `1px solid ${th.border2}`, background: th.inputBg,
    color: th.text, fontFamily: th.fontData, fontSize: 12,
    boxSizing: 'border-box' as const,
  };
  const labelStyle = {
    display: 'block', fontFamily: th.fontLabel, fontSize: 10,
    color: th.text3, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.05em',
  };
  const rowStyle = { marginBottom: 14 };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: 480, background: th.cardBg, border: `1px solid ${th.border2}`,
        borderRadius: 8, padding: 24,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: th.fontMain, fontSize: 14, color: th.text, marginBottom: 20 }}>
          {initial ? 'edit host os' : 'configure host os'}
        </div>

        <div style={rowStyle}>
          <label style={labelStyle}>device</label>
          <select
            value={f.deviceId}
            onChange={e => set('deviceId', e.target.value)}
            style={inputStyle}
            disabled={!!initial}
          >
            <option value="">select device…</option>
            {devices.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div style={rowStyle}>
          <label style={labelStyle}>host os</label>
          <input
            style={inputStyle}
            placeholder="e.g. Proxmox VE, Ubuntu 22.04, Windows Server 2022"
            value={f.hostOs}
            onChange={e => set('hostOs', e.target.value)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, ...rowStyle }}>
          <div>
            <label style={labelStyle}>os version</label>
            <input
              style={inputStyle}
              placeholder="e.g. 8.1.4"
              value={f.osVersion}
              onChange={e => set('osVersion', e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>kernel</label>
            <input
              style={inputStyle}
              placeholder="e.g. 6.2.16-3-pve"
              value={f.kernel}
              onChange={e => set('kernel', e.target.value)}
            />
          </div>
        </div>

        <div style={rowStyle}>
          <label style={labelStyle}>notes</label>
          <textarea
            style={{ ...inputStyle, height: 72, resize: 'vertical' }}
            value={f.notes}
            onChange={e => set('notes', e.target.value)}
          />
        </div>

        {err && (
          <div style={{ fontFamily: th.fontLabel, fontSize: 11, color: th.red, marginBottom: 12 }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            className="btn-ghost"
            style={{
              padding: '6px 16px', borderRadius: 4, border: `1px solid ${th.border2}`,
              background: 'transparent', color: th.text2, fontFamily: th.fontMain,
              fontSize: 12, cursor: 'pointer',
            }}
            onClick={onClose}
          >
            cancel
          </button>
          <button
            className="act-primary"
            style={{
              padding: '6px 16px', borderRadius: 4, border: 'none',
              background: accent, color: '#fff', fontFamily: th.fontMain,
              fontSize: 12, cursor: 'pointer', opacity: saving ? 0.6 : 1,
            }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'saving…' : 'save'}
          </button>
        </div>
      </div>
    </div>
  );
}
