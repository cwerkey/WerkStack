import { useState, useEffect } from 'react';
import { Icon } from '../../../../components/ui/Icon';
import { ErrorBoundary } from '../../../../components/ui/ErrorBoundary';
import { TemplateOverlay } from '../../../../components/ui/TemplateOverlay';
import { useRackStore } from '../../../../store/useRackStore';
import { useTemplateStore } from '../../../../store/useTemplateStore';
import { useTypesStore } from '../../../../store/useTypesStore';
import { api } from '../../../../utils/api';
import type { DeviceInstance } from '@werkstack/shared';

type EditorTab = 'info' | 'ports' | 'drives' | 'pcie';

const TABS: { key: EditorTab; label: string }[] = [
  { key: 'info',   label: 'Info' },
  { key: 'ports',  label: 'Ports' },
  { key: 'drives', label: 'Drives' },
  { key: 'pcie',   label: 'PCIe' },
];

interface DeviceEditorModalProps {
  open:     boolean;
  onClose:  () => void;
  device:   DeviceInstance | null;
  siteId:   string;
  accent:   string;
}

interface InfoDraft {
  name:     string;
  ip:       string;
  serial:   string;
  assetTag: string;
  notes:    string;
  face:     'front' | 'rear';
  rackU:    string;
}

export function DeviceEditorModal({ open, onClose, device, siteId, accent }: DeviceEditorModalProps) {
  const [tab, setTab]     = useState<EditorTab>('info');
  const [f, setF]         = useState<InfoDraft>({ name: '', ip: '', serial: '', assetTag: '', notes: '', face: 'front', rackU: '' });
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState('');
  const [saved, setSaved] = useState(false);

  const deviceTypes     = useTypesStore(s => s.deviceTypes);
  const deviceTemplates = useTemplateStore(s => s.deviceTemplates);

  const av = { '--accent': accent } as React.CSSProperties;

  useEffect(() => {
    if (!open || !device) return;
    setTab('info');
    setErr('');
    setSaved(false);
    setBusy(false);
    setF({
      name:     device.name,
      ip:       device.ip ?? '',
      serial:   device.serial ?? '',
      assetTag: device.assetTag ?? '',
      notes:    device.notes ?? '',
      face:     device.face ?? 'front',
      rackU:    device.rackU ? String(device.rackU) : '',
    });
  }, [open, device?.id]);

  if (!open || !device) return null;

  const template = device.templateId
    ? deviceTemplates.find(t => t.id === device.templateId)
    : undefined;
  const dt = deviceTypes.find(t => t.id === device.typeId);

  const set = <K extends keyof InfoDraft>(k: K, v: InfoDraft[K]) => {
    setF(p => ({ ...p, [k]: v }));
    setSaved(false);
  };

  async function handleSave() {
    if (!device) return;
    if (!f.name.trim()) { setErr('name is required'); return; }
    setBusy(true);
    setErr('');
    try {
      const payload = {
        templateId: device.templateId || undefined,
        typeId:     device.typeId,
        name:       f.name.trim(),
        rackId:     device.rackId || undefined,
        zoneId:     device.zoneId || undefined,
        rackU:      f.rackU ? parseInt(f.rackU, 10) : undefined,
        uHeight:    device.uHeight || undefined,
        face:       f.face,
        ip:         f.ip.trim() || undefined,
        serial:     f.serial.trim() || undefined,
        assetTag:   f.assetTag.trim() || undefined,
        notes:      f.notes.trim() || undefined,
        isDraft:    device.isDraft,
      };
      const updated = await api.patch<DeviceInstance>(`/api/sites/${siteId}/devices/${device.id}`, payload);
      useRackStore.getState().upsertDevice(updated!);
      setSaved(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to save');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!device) return;
    if (!confirm(`Delete device "${device.name}"?`)) return;
    try {
      await api.delete(`/api/sites/${siteId}/devices/${device.id}`);
      useRackStore.getState().removeDevice(device.id);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to delete');
    }
  }


  return (
    <div className="modal-overlay">
      <div style={{
        background: 'var(--cardBg2, #0c0d0e)',
        border: '1px solid var(--border2, #262c30)',
        borderRadius: 14, width: 620, maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 64px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }} onMouseDown={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '14px 18px 0', display: 'flex', flexDirection: 'column',
          borderBottom: '2px solid var(--border, #1d2022)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
                fontWeight: 700, color: accent,
              }}>
                {device.name}
              </span>
              {dt && (
                <span className="badge" style={{
                  background: dt.color + '22', color: dt.color,
                }}>
                  {dt.name}
                </span>
              )}
            </div>
            <button className="modal-close-btn" onClick={onClose}>
              <Icon name="x" size={12} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 0 }}>
            {TABS.map(t => (
              <div
                key={t.key}
                className={`tab-wrap${tab === t.key ? ' active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                <button className="tab-btn-inner">{t.label}</button>
                <div className="tab-line" />
              </div>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div style={{ padding: '16px 18px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          <style>{`
            .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
            .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
            .tab-wrap:hover .tab-btn-inner { color: var(--accent, #c47c5a) !important; }
            .confirm-danger-btn:hover { filter: brightness(1.1) !important; }
          `}</style>

          {/* ── Info tab ──────────────────────────────────────────────── */}
          {tab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="wiz-field">
                <label className="wiz-label">device name</label>
                <input className="wiz-input" value={f.name} onChange={e => set('name', e.target.value)} />
              </div>
              <div className="wiz-grid2">
                <div className="wiz-field">
                  <label className="wiz-label">ip address</label>
                  <input className="wiz-input" value={f.ip} onChange={e => set('ip', e.target.value)} placeholder="192.168.1.x" />
                </div>
                <div className="wiz-field">
                  <label className="wiz-label">face</label>
                  <div className="view-toggle">
                    <button className={`view-toggle-btn${f.face === 'front' ? ' on' : ''}`} onClick={() => set('face', 'front')}>Front</button>
                    <button className={`view-toggle-btn${f.face === 'rear' ? ' on' : ''}`} onClick={() => set('face', 'rear')}>Rear</button>
                  </div>
                </div>
              </div>
              <div className="wiz-grid2">
                <div className="wiz-field">
                  <label className="wiz-label">serial number</label>
                  <input className="wiz-input" value={f.serial} onChange={e => set('serial', e.target.value)} placeholder="—" />
                </div>
                <div className="wiz-field">
                  <label className="wiz-label">asset tag</label>
                  <input className="wiz-input" value={f.assetTag} onChange={e => set('assetTag', e.target.value)} placeholder="—" />
                </div>
              </div>
              <div className="wiz-field">
                <label className="wiz-label">rack position (U)</label>
                <input className="wiz-input" type="number" value={f.rackU} onChange={e => set('rackU', e.target.value)} placeholder="bottom U number" min={1} />
              </div>
              <div className="wiz-field">
                <label className="wiz-label">notes</label>
                <textarea className="wiz-input" value={f.notes} onChange={e => set('notes', e.target.value)} rows={3} style={{ resize: 'vertical' }} placeholder="—" />
              </div>
              {template && (
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: 'var(--text3, #4e5560)',
                }}>
                  template: {template.make} {template.model} ({template.formFactor}, {template.uHeight}U)
                </div>
              )}
            </div>
          )}

          {/* ── Ports tab ─────────────────────────────────────────────── */}
          {tab === 'ports' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {template ? (
                <>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                    color: 'var(--text2, #8a9299)', marginBottom: 4,
                  }}>
                    Front panel
                  </div>
                  <ErrorBoundary>
                    <TemplateOverlay
                      blocks={template.layout.front}
                      gridCols={template.formFactor === 'rack' ? 96 : (template.gridCols ?? 96)}
                      gridRows={template.formFactor === 'rack' ? template.uHeight * 12 : (template.gridRows ?? 12)}
                      width={560}
                      showLabels
                    />
                  </ErrorBoundary>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                    color: 'var(--text2, #8a9299)', marginTop: 8, marginBottom: 4,
                  }}>
                    Rear panel
                  </div>
                  <ErrorBoundary>
                    <TemplateOverlay
                      blocks={template.layout.rear}
                      gridCols={template.formFactor === 'rack' ? 96 : (template.gridCols ?? 96)}
                      gridRows={template.formFactor === 'rack' ? template.uHeight * 12 : (template.gridRows ?? 12)}
                      width={560}
                      showLabels
                    />
                  </ErrorBoundary>
                </>
              ) : (
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  color: 'var(--text3, #4e5560)', padding: '20px 0', textAlign: 'center',
                }}>
                  no template assigned — port layout unavailable
                </div>
              )}
            </div>
          )}

          {/* ── Drives tab ────────────────────────────────────────────── */}
          {tab === 'drives' && (
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              color: 'var(--text3, #4e5560)', padding: '20px 0', textAlign: 'center',
            }}>
              drive management comes in Phase 7 (Storage Screen)
            </div>
          )}

          {/* ── PCIe tab ──────────────────────────────────────────────── */}
          {tab === 'pcie' && (
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              color: 'var(--text3, #4e5560)', padding: '20px 0', textAlign: 'center',
            }}>
              PCIe module assignment — cards installed in this device's slots will appear here.
              {template && (() => {
                const pcieSlots = template.layout.rear.filter(
                  b => b.type === 'pcie-fh' || b.type === 'pcie-lp' || b.type === 'pcie-dw'
                );
                return pcieSlots.length > 0 ? (
                  <div style={{ marginTop: 12, color: 'var(--text2, #8a9299)' }}>
                    {pcieSlots.length} PCIe slot{pcieSlots.length !== 1 ? 's' : ''} available
                  </div>
                ) : (
                  <div style={{ marginTop: 12 }}>
                    no PCIe slots on this template
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '11px 18px',
          borderTop: '1px solid var(--border2, #262c30)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <button
            className="btn-ghost"
            style={{ color: 'var(--red, #c07070)', fontSize: 10, padding: '3px 10px' }}
            onClick={handleDelete}
          >
            <Icon name="trash" size={10} /> delete device
          </button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {err && (
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                color: 'var(--red, #c07070)',
              }}>
                {err}
              </span>
            )}
            {saved && (
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                color: 'var(--green, #8ab89e)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Icon name="check" size={10} color="var(--green, #8ab89e)" /> saved
              </span>
            )}
            <button className="btn-ghost" onClick={onClose}>close</button>
            {tab === 'info' && (
              <button className="act-primary" style={av} onClick={handleSave} disabled={busy}>
                {busy ? 'saving…' : 'save'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
