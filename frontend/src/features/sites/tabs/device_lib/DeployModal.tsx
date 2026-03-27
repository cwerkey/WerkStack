import { useState, useEffect } from 'react';
import { Icon } from '../../../../components/ui/Icon';
import { api } from '../../../../utils/api';
import { useRackStore } from '../../../../store/useRackStore';
import type { DeviceTemplate, DeviceInstance } from '@werkstack/shared';

// Deploy Modal — creates a DeviceInstance from a DeviceTemplate via the API.

interface DeployModalProps {
  open:     boolean;
  onClose:  () => void;
  template: DeviceTemplate | null;
  accent:   string;
  siteId:   string;
}

interface DeployForm {
  name:     string;
  ip:       string;
  serial:   string;
  assetTag: string;
  notes:    string;
}

function blankForm(): DeployForm {
  return { name: '', ip: '', serial: '', assetTag: '', notes: '' };
}

export function DeployModal({ open, onClose, template, accent, siteId }: DeployModalProps) {
  const [form, setForm] = useState<DeployForm>(blankForm());
  const [deployed, setDeployed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  useEffect(() => {
    if (open) {
      setForm(blankForm());
      setDeployed(false);
      setBusy(false);
      setErr('');
    }
  }, [open]);

  if (!open || !template) return null;

  const set = <K extends keyof DeployForm>(k: K, v: DeployForm[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  async function handleDeploy() {
    if (!template || !siteId) return;
    setBusy(true);
    setErr('');
    try {
      const payload = {
        templateId: template.id,
        typeId:     template.category,
        name:       form.name.trim() || `${template.make} ${template.model}`,
        uHeight:    template.uHeight,
        face:       'front' as const,
        ip:         form.ip.trim() || undefined,
        serial:     form.serial.trim() || undefined,
        assetTag:   form.assetTag.trim() || undefined,
        notes:      form.notes.trim() || undefined,
        isDraft:    false,
      };
      const device = await api.post<DeviceInstance>(`/api/sites/${siteId}/devices`, payload);
      if (device) {
        useRackStore.getState().upsertDevice(device);
      }
      setDeployed(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to deploy');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="deploy-modal-overlay">
      <div className="deploy-modal">
        <div className="deploy-mhdr">
          <span className="deploy-mttl" style={{ color: accent }}>
            Deploy {template.make} {template.model}
          </span>
          <button className="modal-close-btn" onClick={onClose}>
            <Icon name="x" size={12} />
          </button>
        </div>

        <div className="deploy-mbody">
          {deployed ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 12, padding: '24px 0',
            }}>
              <Icon name="check" size={32} color="var(--green, #8ab89e)" />
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                fontWeight: 700, color: 'var(--green, #8ab89e)',
              }}>
                Device instance created
              </span>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                color: 'var(--text3, #4e5560)', textAlign: 'center',
              }}>
                The device is now active. Drag it into a rack in Rack View.
              </span>
            </div>
          ) : (
            <>
              <div className="wiz-field">
                <label className="deploy-flabel">Device Name</label>
                <input className="deploy-finput" value={form.name} onChange={e => set('name', e.target.value)} placeholder={`${template.make} ${template.model}`} />
              </div>
              <div className="deploy-fg2">
                <div className="wiz-field">
                  <label className="deploy-flabel">IP Address</label>
                  <input className="deploy-finput" value={form.ip} onChange={e => set('ip', e.target.value)} placeholder="192.168.1.x" />
                </div>
                <div className="wiz-field">
                  <label className="deploy-flabel">Serial Number</label>
                  <input className="deploy-finput" value={form.serial} onChange={e => set('serial', e.target.value)} placeholder="—" />
                </div>
              </div>
              <div className="deploy-fg2">
                <div className="wiz-field">
                  <label className="deploy-flabel">Asset Tag</label>
                  <input className="deploy-finput" value={form.assetTag} onChange={e => set('assetTag', e.target.value)} placeholder="—" />
                </div>
                <div className="wiz-field">
                  <label className="deploy-flabel">Notes</label>
                  <input className="deploy-finput" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="—" />
                </div>
              </div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                color: 'var(--text3, #4e5560)', padding: '4px 0',
              }}>
                Template: {template.make} {template.model} ({template.formFactor}, {template.uHeight}U) — {template.layout.front.length + template.layout.rear.length} blocks
              </div>
              {err && (
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: 'var(--red, #c07070)',
                }}>
                  {err}
                </div>
              )}
            </>
          )}
        </div>

        <div className="deploy-mftr">
          {deployed ? (
            <button className="act-primary" onClick={onClose}>Done</button>
          ) : (
            <>
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="act-primary" onClick={handleDeploy} disabled={busy}>
                <Icon name="zap" size={12} /> {busy ? 'Deploying…' : 'Deploy'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
