import { useState, useEffect } from 'react';
import type { OsVm, OsHost, OsExtraIp, OsVmDrive, VmType } from '@werkstack/shared';
import type { OsThemeTokens } from '../../../../store/useThemeStore';

interface Props {
  open:      boolean;
  initial?:  OsVm | null;
  hosts:     OsHost[];
  vms:       OsVm[];
  vmTypes:   VmType[];
  th:        OsThemeTokens;
  accent:    string;
  onSave:    (data: Omit<OsVm, 'id' | 'orgId' | 'siteId' | 'createdAt'>) => Promise<void>;
  onClose:   () => void;
}

const blankForm = () => ({
  hostId: '', parentVmId: '', name: '', typeId: 'vt-vm',
  vmOs: '', osVersion: '', cpus: '', ramGb: '', ip: '', notes: '',
});

export function VmEditorModal({ open, initial, hosts, vms, vmTypes, th, accent, onSave, onClose }: Props) {
  const [f, setF]           = useState(blankForm());
  const [extraIps, setExtraIps] = useState<OsExtraIp[]>([]);
  const [drives, setDrives]     = useState<OsVmDrive[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  useEffect(() => {
    if (open) {
      setErr('');
      if (initial) {
        setF({
          hostId:     initial.hostId,
          parentVmId: initial.parentVmId ?? '',
          name:       initial.name,
          typeId:     initial.typeId,
          vmOs:       initial.vmOs ?? '',
          osVersion:  initial.osVersion ?? '',
          cpus:       initial.cpus != null ? String(initial.cpus) : '',
          ramGb:      initial.ramGb != null ? String(initial.ramGb) : '',
          ip:         initial.ip ?? '',
          notes:      initial.notes ?? '',
        });
        setExtraIps(initial.extraIps ?? []);
        setDrives(initial.drives ?? []);
      } else {
        setF(blankForm());
        setExtraIps([]);
        setDrives([]);
      }
    }
  }, [open]);

  const set = (k: keyof ReturnType<typeof blankForm>, v: string) => setF(p => ({ ...p, [k]: v }));

  if (!open) return null;

  async function handleSave() {
    if (!f.hostId) { setErr('select a host device'); return; }
    if (!f.name.trim()) { setErr('name is required'); return; }
    if (!f.typeId) { setErr('type is required'); return; }
    setSaving(true);
    try {
      await onSave({
        hostId:     f.hostId,
        parentVmId: f.parentVmId || undefined,
        name:       f.name.trim(),
        typeId:     f.typeId,
        vmOs:       f.vmOs.trim() || undefined,
        osVersion:  f.osVersion.trim() || undefined,
        cpus:       f.cpus ? parseInt(f.cpus, 10) : undefined,
        ramGb:      f.ramGb ? parseFloat(f.ramGb) : undefined,
        ip:         f.ip.trim() || undefined,
        extraIps:   extraIps.filter(x => x.ip.trim()),
        drives:     drives.filter(x => x.label.trim()),
        notes:      f.notes.trim() || undefined,
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
    marginBottom: 8, marginTop: 4,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  };

  // filter out the VM being edited from parent options (avoid self-reference)
  const parentOptions = vms.filter(v => !initial || v.id !== initial.id);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: 560, maxHeight: '90vh', overflowY: 'auto',
        background: th.cardBg, border: `1px solid ${th.border2}`,
        borderRadius: 8, padding: 24,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: th.fontMain, fontSize: 14, color: th.text, marginBottom: 20 }}>
          {initial ? 'edit vm / container' : 'add vm / container'}
        </div>

        {/* Host + Parent */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, ...rowStyle }}>
          <div>
            <label style={labelStyle}>host device</label>
            <select value={f.hostId} onChange={e => set('hostId', e.target.value)} style={inputStyle}>
              <option value="">select host…</option>
              {hosts.map(h => (
                <option key={h.id} value={h.id}>{h.hostOs}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>parent vm (nested)</label>
            <select value={f.parentVmId} onChange={e => set('parentVmId', e.target.value)} style={inputStyle}>
              <option value="">none</option>
              {parentOptions.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Name + Type */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, ...rowStyle }}>
          <div>
            <label style={labelStyle}>name</label>
            <input style={inputStyle} placeholder="pve-vm-01" value={f.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>type</label>
            <select value={f.typeId} onChange={e => set('typeId', e.target.value)} style={inputStyle}>
              {vmTypes.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* OS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, ...rowStyle }}>
          <div>
            <label style={labelStyle}>vm os</label>
            <input style={inputStyle} placeholder="Ubuntu, Debian, Alpine…" value={f.vmOs} onChange={e => set('vmOs', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>os version</label>
            <input style={inputStyle} placeholder="22.04" value={f.osVersion} onChange={e => set('osVersion', e.target.value)} />
          </div>
        </div>

        {/* Resources + IP */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, ...rowStyle }}>
          <div>
            <label style={labelStyle}>cpus</label>
            <input style={inputStyle} type="number" min={1} placeholder="4" value={f.cpus} onChange={e => set('cpus', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>ram (gb)</label>
            <input style={inputStyle} type="number" min={0.5} step={0.5} placeholder="8" value={f.ramGb} onChange={e => set('ramGb', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>primary ip</label>
            <input style={inputStyle} placeholder="10.0.1.5" value={f.ip} onChange={e => set('ip', e.target.value)} />
          </div>
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

        {/* Drives */}
        <div style={rowStyle}>
          <div style={sectionHead}>
            <span>drives</span>
            <button
              style={{
                padding: '2px 10px', borderRadius: 3, border: `1px solid ${th.border2}`,
                background: 'transparent', color: th.text2, fontFamily: th.fontLabel,
                fontSize: 10, cursor: 'pointer',
              }}
              onClick={() => setDrives(p => [...p, { label: '', size: '', mountpoint: '' }])}
            >+ add</button>
          </div>
          {drives.map((d, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr auto', gap: 6, marginBottom: 6 }}>
              <input
                style={inputStyle}
                placeholder="label"
                value={d.label}
                onChange={e => setDrives(p => p.map((item, j) => j === i ? { ...item, label: e.target.value } : item))}
              />
              <input
                style={inputStyle}
                placeholder="32G"
                value={d.size}
                onChange={e => setDrives(p => p.map((item, j) => j === i ? { ...item, size: e.target.value } : item))}
              />
              <input
                style={inputStyle}
                placeholder="/mnt/data"
                value={d.mountpoint ?? ''}
                onChange={e => setDrives(p => p.map((item, j) => j === i ? { ...item, mountpoint: e.target.value } : item))}
              />
              <button
                style={{
                  padding: '5px 8px', borderRadius: 3, border: `1px solid ${th.border2}`,
                  background: 'transparent', color: th.red, fontFamily: th.fontLabel,
                  fontSize: 11, cursor: 'pointer',
                }}
                onClick={() => setDrives(p => p.filter((_, j) => j !== i))}
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

