import { useState, useEffect } from 'react';
import type { OsApp, OsVm, OsHost, OsExtraIp, AppType } from '@werkstack/shared';
import type { OsThemeTokens } from '../../../../store/useThemeStore';
import { sanitizeUrl } from '../../../../utils/sanitize';

interface Props {
  open:      boolean;
  initial?:  OsApp | null;
  defaultVmId?:   string;
  defaultHostId?: string;
  vms:       OsVm[];
  hosts:     OsHost[];
  appTypes:  AppType[];
  th:        OsThemeTokens;
  accent:    string;
  onSave:    (data: Omit<OsApp, 'id' | 'orgId' | 'siteId' | 'createdAt'>) => Promise<void>;
  onClose:   () => void;
}

const blankForm = () => ({
  parentType: 'vm' as 'vm' | 'host',
  vmId: '', hostId: '',
  name: '', typeId: 'at-web',
  version: '', url: '', ip: '', notes: '',
});

export function AppEditorModal({ open, initial, defaultVmId, defaultHostId, vms, hosts, appTypes, th, accent, onSave, onClose }: Props) {
  const [f, setF]               = useState(blankForm());
  const [extraIps, setExtraIps] = useState<OsExtraIp[]>([]);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');

  useEffect(() => {
    if (open) {
      setErr('');
      if (initial) {
        setF({
          parentType: initial.vmId ? 'vm' : 'host',
          vmId:       initial.vmId ?? '',
          hostId:     initial.hostId ?? '',
          name:       initial.name,
          typeId:     initial.typeId,
          version:    initial.version ?? '',
          url:        initial.url ?? '',
          ip:         initial.ip ?? '',
          notes:      initial.notes ?? '',
        });
        setExtraIps(initial.extraIps ?? []);
      } else {
        setF({
          ...blankForm(),
          parentType: defaultVmId ? 'vm' : defaultHostId ? 'host' : 'vm',
          vmId: defaultVmId ?? '',
          hostId: defaultHostId ?? '',
        });
        setExtraIps([]);
      }
    }
  }, [open]);

  const set = (k: keyof ReturnType<typeof blankForm>, v: string) => setF(p => ({ ...p, [k]: v }));

  if (!open) return null;

  async function handleSave() {
    const parentId = f.parentType === 'vm' ? f.vmId : f.hostId;
    if (!parentId) { setErr(`select a ${f.parentType}`); return; }
    if (!f.name.trim()) { setErr('name is required'); return; }
    setSaving(true);
    try {
      await onSave({
        vmId:     f.parentType === 'vm' ? f.vmId || undefined : undefined,
        hostId:   f.parentType === 'host' ? f.hostId || undefined : undefined,
        name:     f.name.trim(),
        typeId:   f.typeId,
        version:  f.version.trim() || undefined,
        url:      f.url.trim() ? sanitizeUrl(f.url.trim()) : undefined,
        ip:       f.ip.trim() || undefined,
        extraIps: extraIps.filter(x => x.ip.trim()),
        notes:    f.notes.trim() || undefined,
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
  const sectionHead = {
    fontFamily: th.fontLabel, fontSize: 10, color: th.text3,
    textTransform: 'uppercase' as const, letterSpacing: '0.08em',
    marginBottom: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: 520, maxHeight: '90vh', overflowY: 'auto',
        background: th.cardBg, border: `1px solid ${th.border2}`,
        borderRadius: 8, padding: 24,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: th.fontMain, fontSize: 14, color: th.text, marginBottom: 20 }}>
          {initial ? 'edit application' : 'add application'}
        </div>

        {/* Parent selector toggle */}
        <div style={rowStyle}>
          <label style={labelStyle}>runs on</label>
          <div style={{ display: 'flex', gap: 0, marginBottom: 8 }}>
            {(['vm', 'host'] as const).map(pt => (
              <button
                key={pt}
                style={{
                  padding: '4px 14px', border: `1px solid ${th.border2}`,
                  borderRadius: pt === 'vm' ? '3px 0 0 3px' : '0 3px 3px 0',
                  background: f.parentType === pt ? accent : 'transparent',
                  color: f.parentType === pt ? '#fff' : th.text2,
                  fontFamily: th.fontLabel, fontSize: 11, cursor: 'pointer',
                }}
                onClick={() => set('parentType', pt)}
              >{pt === 'vm' ? 'vm / container' : 'bare metal host'}</button>
            ))}
          </div>
          {f.parentType === 'vm' ? (
            <select value={f.vmId} onChange={e => set('vmId', e.target.value)} style={inputStyle}>
              <option value="">select vm…</option>
              {vms.map(v => (
                <option key={v.id} value={v.id}>{v.name} ({v.vmOs ?? v.typeId})</option>
              ))}
            </select>
          ) : (
            <select value={f.hostId} onChange={e => set('hostId', e.target.value)} style={inputStyle}>
              <option value="">select host…</option>
              {hosts.map(h => (
                <option key={h.id} value={h.id}>{h.hostOs} {h.osVersion ?? ''}</option>
              ))}
            </select>
          )}
        </div>

        {/* Name + Type */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, ...rowStyle }}>
          <div>
            <label style={labelStyle}>name</label>
            <input style={inputStyle} placeholder="nginx, postgres, grafana…" value={f.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>type</label>
            <select value={f.typeId} onChange={e => set('typeId', e.target.value)} style={inputStyle}>
              {appTypes.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Version + IP */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, ...rowStyle }}>
          <div>
            <label style={labelStyle}>version</label>
            <input style={inputStyle} placeholder="1.25.3" value={f.version} onChange={e => set('version', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>ip / port</label>
            <input style={inputStyle} placeholder="10.0.1.5:8080" value={f.ip} onChange={e => set('ip', e.target.value)} />
          </div>
        </div>

        {/* URL */}
        <div style={rowStyle}>
          <label style={labelStyle}>url</label>
          <input style={inputStyle} placeholder="https://app.example.com" value={f.url} onChange={e => set('url', e.target.value)} />
        </div>

        {/* Extra IPs */}
        <div style={rowStyle}>
          <div style={sectionHead}>
            <span>extra ips</span>
            <button
              style={{
                padding: '2px 10px', borderRadius: 3, border: `1px solid ${th.border2}`,
                background: 'transparent', color: th.text2, fontFamily: th.fontLabel,
                fontSize: 10, cursor: 'pointer',
              }}
              onClick={() => setExtraIps(p => [...p, { label: '', ip: '' }])}
            >+ add</button>
          </div>
          {extraIps.map((x, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 6 }}>
              <input
                style={inputStyle}
                placeholder="label"
                value={x.label}
                onChange={e => setExtraIps(p => p.map((item, j) => j === i ? { ...item, label: e.target.value } : item))}
              />
              <input
                style={inputStyle}
                placeholder="ip address"
                value={x.ip}
                onChange={e => setExtraIps(p => p.map((item, j) => j === i ? { ...item, ip: e.target.value } : item))}
              />
              <button
                style={{
                  padding: '5px 8px', borderRadius: 3, border: `1px solid ${th.border2}`,
                  background: 'transparent', color: th.red, fontFamily: th.fontLabel,
                  fontSize: 11, cursor: 'pointer',
                }}
                onClick={() => setExtraIps(p => p.filter((_, j) => j !== i))}
              >×</button>
            </div>
          ))}
        </div>

        {/* Notes */}
        <div style={rowStyle}>
          <label style={labelStyle}>notes</label>
          <textarea
            style={{ ...inputStyle, height: 64, resize: 'vertical' }}
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
          >cancel</button>
          <button
            className="act-primary"
            style={{
              padding: '6px 16px', borderRadius: 4, border: 'none',
              background: accent, color: '#fff', fontFamily: th.fontMain,
              fontSize: 12, cursor: 'pointer', opacity: saving ? 0.6 : 1,
            }}
            onClick={handleSave}
            disabled={saving}
          >{saving ? 'saving…' : 'save'}</button>
        </div>
      </div>
    </div>
  );
}
