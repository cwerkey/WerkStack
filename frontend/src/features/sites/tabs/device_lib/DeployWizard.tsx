import { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../../../components/ui/Icon';
import { ErrorBoundary } from '../../../../components/ui/ErrorBoundary';
import { TemplateOverlay } from '../../../../components/ui/TemplateOverlay';
import { api } from '../../../../utils/api';
import { useRackStore } from '../../../../store/useRackStore';
import { useTemplateStore } from '../../../../store/useTemplateStore';
import { useTypesStore } from '../../../../store/useTypesStore';
import { BLOCK_DEF_MAP } from '@werkstack/shared';
import type { DeviceInstance, Drive } from '@werkstack/shared';

// ── Types ────────────────────────────────────────────────────────────────────

interface DeployWizardProps {
  open:        boolean;
  onClose:     () => void;
  siteId:      string;
  accent:      string;
  /** Pre-selected template (from device lib) */
  templateId?: string;
  /** Pre-filled rack + U (from rack view right-click) */
  preRackId?:  string;
  preRackU?:   number;
  preFace?:    'front' | 'rear';
}

type Step = 'info' | 'rack' | 'drives' | 'ports' | 'pcie' | 'summary';

// Steps are dynamically built based on template capabilities

interface InfoForm {
  templateId: string;
  name:       string;
  ip:         string;
  serial:     string;
  assetTag:   string;
  notes:      string;
}

type DriveType = 'hdd' | 'ssd' | 'nvme' | 'tape';
const DRIVE_TYPES: DriveType[] = ['hdd', 'ssd', 'nvme', 'tape'];

interface DriveDraft {
  blockId:    string;
  label:      string;
  capacity:   string;
  driveType:  DriveType;
  serial:     string;
  isBoot:     boolean;
}

const RACK_U_HEIGHT = 40;
const RACK_WIDTH = 320;

// ── Helpers ──────────────────────────────────────────────────────────────────

function isPortBlock(type: string): boolean {
  const def = BLOCK_DEF_MAP.get(type);
  if (!def) return false;
  return def.isNet || def.isPort || type === 'power' || type.startsWith('misc-');
}

function isDriveBlock(type: string): boolean {
  return type.startsWith('bay-');
}

function isPcieSlot(type: string): boolean {
  return type === 'pcie-fh' || type === 'pcie-lp' || type === 'pcie-dw';
}

// ── Component ────────────────────────────────────────────────────────────────

export function DeployWizard({
  open, onClose, siteId, accent,
  templateId: preTemplateId, preRackId, preRackU, preFace,
}: DeployWizardProps) {
  const deviceTemplates = useTemplateStore(s => s.deviceTemplates);
  const racks           = useRackStore(s => s.racks);
  const devices         = useRackStore(s => s.devices);
  const deviceTypes     = useTypesStore(s => s.deviceTypes);

  // State
  const [step, setStep]   = useState<Step>('info');
  const [info, setInfo]   = useState<InfoForm>({ templateId: '', name: '', ip: '', serial: '', assetTag: '', notes: '' });
  const [rackId, setRackId]     = useState<string>('');
  const [rackU, setRackU]       = useState<number | null>(null);
  const [face, setFace]         = useState<'front' | 'rear'>('front');
  const [driveDrafts, setDriveDrafts] = useState<DriveDraft[]>([]);
  const [copySource, setCopySource]   = useState<DriveDraft | null>(null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setStep('info');
    setInfo({
      templateId: preTemplateId ?? '',
      name: '', ip: '', serial: '', assetTag: '', notes: '',
    });
    setRackId(preRackId ?? '');
    setRackU(preRackU ?? null);
    setFace(preFace ?? 'front');
    setDriveDrafts([]);
    setCopySource(null);
    setSaving(false);
    setError('');
  }, [open, preTemplateId, preRackId, preRackU, preFace]);

  const template = deviceTemplates.find(t => t.id === info.templateId) ?? null;
  const rackMountTemplates = deviceTemplates.filter(t => t.formFactor === 'rack');
  const av = { '--accent': accent } as React.CSSProperties;

  // Drive blocks from template
  const driveBlocks = useMemo(() => {
    if (!template) return [];
    const front = template.layout.front.filter(b => isDriveBlock(b.type));
    const rear  = template.layout.rear.filter(b => isDriveBlock(b.type));
    return [...front, ...rear];
  }, [template]);

  // Port blocks from template
  const portBlocks = useMemo(() => {
    if (!template) return [];
    const front = template.layout.front.filter(b => isPortBlock(b.type));
    const rear  = template.layout.rear.filter(b => isPortBlock(b.type));
    return [...front, ...rear];
  }, [template]);

  // PCIe slots from template
  const pcieSlots = useMemo(() => {
    if (!template) return [];
    return template.layout.rear.filter(b => isPcieSlot(b.type));
  }, [template]);

  // Relevant steps (skip drives/ports/pcie if template has none)
  const activeSteps = useMemo(() => {
    const steps: Step[] = ['info', 'rack'];
    if (driveBlocks.length > 0) steps.push('drives');
    if (portBlocks.length > 0) steps.push('ports');
    if (pcieSlots.length > 0)  steps.push('pcie');
    steps.push('summary');
    return steps;
  }, [driveBlocks.length, portBlocks.length, pcieSlots.length]);

  if (!open) return null;

  const stepIdx = activeSteps.indexOf(step);
  const canBack = stepIdx > 0;

  const set = <K extends keyof InfoForm>(k: K, v: InfoForm[K]) =>
    setInfo(prev => ({ ...prev, [k]: v }));

  // ── Rack picker helpers ──────────────────────────────────────────────────

  const activeRack = racks.find(r => r.id === rackId) ?? null;
  const rackDevices = useMemo(() =>
    devices.filter(d => d.rackId === rackId && d.face === face),
  [devices, rackId, face]);

  const uPositions = useMemo(() => {
    if (!activeRack) return [];
    const arr: number[] = [];
    for (let u = activeRack.uHeight; u >= 1; u--) arr.push(u);
    return arr;
  }, [activeRack?.uHeight]);

  function isUOccupied(u: number): boolean {
    return rackDevices.some(d => {
      if (!d.rackU || !d.uHeight) return false;
      return u >= d.rackU && u < d.rackU + d.uHeight;
    });
  }

  function hasCollision(targetU: number): boolean {
    if (!template) return true;
    for (let u = targetU; u < targetU + template.uHeight; u++) {
      if (isUOccupied(u)) return true;
    }
    return false;
  }

  // ── Step validation ──────────────────────────────────────────────────────

  function canProceedFromStep(s: Step): boolean {
    if (s === 'info') return !!info.templateId;
    if (s === 'rack') return true; // rack placement is optional
    return true;
  }

  // ── Drive drafts helpers ─────────────────────────────────────────────────

  function getDriveDraft(blockId: string): DriveDraft | undefined {
    return driveDrafts.find(d => d.blockId === blockId);
  }

  function setDriveDraft(blockId: string, draft: DriveDraft) {
    setDriveDrafts(prev => {
      const idx = prev.findIndex(d => d.blockId === blockId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = draft;
        return next;
      }
      return [...prev, draft];
    });
  }

  function removeDriveDraft(blockId: string) {
    setDriveDrafts(prev => prev.filter(d => d.blockId !== blockId));
  }

  function handleCopyDrive(draft: DriveDraft) {
    setCopySource(draft);
  }

  function handlePasteDrive(blockId: string) {
    if (!copySource) return;
    setDriveDraft(blockId, {
      blockId,
      label: '',
      capacity: copySource.capacity,
      driveType: copySource.driveType,
      serial: '',
      isBoot: false,
    });
  }

  // ── Deploy ───────────────────────────────────────────────────────────────

  async function handleDeploy(asDraft: boolean) {
    if (!template) return;
    setSaving(true);
    setError('');
    try {
      // Create device instance
      const devicePayload = {
        templateId: template.id,
        typeId:     template.category,
        name:       info.name.trim() || `${template.make} ${template.model}`,
        uHeight:    template.uHeight,
        face,
        rackId:     rackId || undefined,
        rackU:      rackU ?? undefined,
        ip:         info.ip.trim() || undefined,
        serial:     info.serial.trim() || undefined,
        assetTag:   info.assetTag.trim() || undefined,
        notes:      info.notes.trim() || undefined,
        isDraft:    asDraft,
      };

      const device = await api.post<DeviceInstance>(`/api/sites/${siteId}/devices`, devicePayload);
      useRackStore.getState().upsertDevice(device);

      // Create drives
      for (const draft of driveDrafts) {
        if (!draft.capacity.trim()) continue;
        try {
          const drive = await api.post<Drive>(`/api/sites/${siteId}/drives`, {
            deviceId:    device.id,
            slotBlockId: draft.blockId,
            label:       draft.label.trim() || undefined,
            capacity:    draft.capacity.trim(),
            driveType:   draft.driveType,
            serial:      draft.serial.trim() || undefined,
            isBoot:      draft.isBoot,
          });
          useRackStore.getState().upsertDrive(drive);
        } catch {
          // continue with other drives
        }
      }

      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'deploy failed');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="wizard-modal-overlay">
      <div className="wizard-panel" style={{
        width: step === 'rack' ? 'calc(100vw - 80px)' : 680,
        maxWidth: step === 'rack' ? 'none' : 'calc(100vw - 32px)',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px 12px',
          borderBottom: '1px solid var(--border, #1d2022)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
            fontWeight: 700, color: accent,
          }}>
            Deploy Device
          </span>
          <button className="modal-close-btn" onClick={onClose}>
            <Icon name="x" size={12} />
          </button>
        </div>

        {/* Step indicator */}
        <div style={{ padding: '12px 18px 0' }}>
          <div className="wizard-step-indicator">
            {activeSteps.map((s, i) => {
              const isCurrent = s === step;
              const isDone = i < stepIdx;
              return (
                <div key={s} className={`wizard-step ${isCurrent ? 'active' : isDone ? 'done' : 'pending'}`}>
                  <div className="wizard-step-num">{i + 1}</div>
                  <div className="wizard-step-label">{s === 'info' ? 'Info' : s === 'rack' ? 'Rack' : s === 'drives' ? 'Drives' : s === 'ports' ? 'Ports' : s === 'pcie' ? 'PCIe' : 'Summary'}</div>
                  {i < activeSteps.length - 1 && <div className="wizard-step-line" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '0 18px 16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── Step: Info ──────────────────────────────────────────────── */}
          {step === 'info' && (
            <>
              {/* Template selector (shown when no pre-selected template) */}
              {!preTemplateId && (
                <div className="wiz-field">
                  <label className="wiz-label">Template</label>
                  <select
                    className="wiz-input"
                    value={info.templateId}
                    onChange={e => set('templateId', e.target.value)}
                  >
                    <option value="">— select template —</option>
                    {rackMountTemplates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.manufacturer ? `${t.manufacturer} ` : ''}{t.make} {t.model} ({t.uHeight}U)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {template && (
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: 'var(--text3, #4e5560)', padding: '2px 0',
                }}>
                  {template.manufacturer ? `${template.manufacturer} ` : ''}{template.make} {template.model} — {template.formFactor}, {template.uHeight}U
                </div>
              )}

              <div className="wiz-field">
                <label className="wiz-label">Device Name</label>
                <input
                  className="wiz-input"
                  value={info.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder={template ? `${template.make} ${template.model}` : 'Device name'}
                />
              </div>

              <div className="wiz-grid2">
                <div className="wiz-field">
                  <label className="wiz-label">IP Address</label>
                  <input className="wiz-input" value={info.ip} onChange={e => set('ip', e.target.value)} placeholder="192.168.1.x" />
                </div>
                <div className="wiz-field">
                  <label className="wiz-label">Serial Number</label>
                  <input className="wiz-input" value={info.serial} onChange={e => set('serial', e.target.value)} placeholder="—" />
                </div>
              </div>

              <div className="wiz-grid2">
                <div className="wiz-field">
                  <label className="wiz-label">Asset Tag</label>
                  <input className="wiz-input" value={info.assetTag} onChange={e => set('assetTag', e.target.value)} placeholder="—" />
                </div>
                <div className="wiz-field">
                  <label className="wiz-label">Notes</label>
                  <input className="wiz-input" value={info.notes} onChange={e => set('notes', e.target.value)} placeholder="—" />
                </div>
              </div>
            </>
          )}

          {/* ── Step: Rack ─────────────────────────────────────────────── */}
          {step === 'rack' && (
            <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
              {/* Rack selector */}
              <div style={{ width: 160, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="wiz-field">
                  <label className="wiz-label">Rack</label>
                  <select className="wiz-input" value={rackId} onChange={e => { setRackId(e.target.value); setRackU(null); }}>
                    <option value="">— none —</option>
                    {racks.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div className="wiz-field">
                  <label className="wiz-label">Face</label>
                  <div className="view-toggle" style={{ width: '100%' }}>
                    <button
                      className={`view-toggle-btn${face === 'front' ? ' on' : ''}`}
                      onClick={() => setFace('front')}
                      style={{ flex: 1 }}
                    >
                      Front
                    </button>
                    <button
                      className={`view-toggle-btn${face === 'rear' ? ' on' : ''}`}
                      onClick={() => setFace('rear')}
                      style={{ flex: 1 }}
                    >
                      Rear
                    </button>
                  </div>
                </div>
                {rackU != null && (
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                    color: accent, fontWeight: 600,
                  }}>
                    U{rackU} selected
                  </div>
                )}
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                  color: 'var(--text3, #4e5560)', marginTop: 4,
                }}>
                  Click an empty row to place the device. Leave rack empty to create an unracked device.
                </div>
              </div>

              {/* Mini rack view */}
              {activeRack && (
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', gap: 0 }}>
                    {/* U labels */}
                    <div style={{ width: 28, flexShrink: 0 }}>
                      {uPositions.map(u => (
                        <div key={u} style={{
                          height: RACK_U_HEIGHT,
                          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                          paddingRight: 4,
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 8, color: 'var(--text3, #4e5560)',
                          userSelect: 'none',
                        }}>
                          {u}
                        </div>
                      ))}
                    </div>

                    {/* Rack body */}
                    <div style={{
                      width: RACK_WIDTH,
                      height: activeRack.uHeight * RACK_U_HEIGHT,
                      position: 'relative',
                      background: 'var(--cardBg, #141618)',
                      border: '1px solid var(--border2, #262c30)',
                      borderRadius: 6,
                      overflow: 'hidden',
                    }}>
                      {/* U rows — clickable */}
                      {uPositions.map(u => {
                        const occupied = isUOccupied(u);
                        const isSelected = rackU === u;
                        return (
                          <div
                            key={u}
                            style={{
                              position: 'absolute',
                              top: (activeRack.uHeight - u) * RACK_U_HEIGHT,
                              left: 0, right: 0,
                              height: RACK_U_HEIGHT,
                              borderBottom: '1px solid var(--border, #1d2022)',
                              cursor: occupied ? 'default' : 'pointer',
                              background: isSelected ? accent + '22' : 'transparent',
                              transition: 'background 0.1s',
                              zIndex: 5,
                            }}
                            onClick={() => {
                              if (!occupied) setRackU(u);
                            }}
                          />
                        );
                      })}

                      {/* Existing devices */}
                      {rackDevices.map(d => {
                        if (!d.rackU || !d.uHeight) return null;
                        const dt = deviceTypes.find(t => t.id === d.typeId);
                        const topOffset = (activeRack.uHeight - d.rackU - d.uHeight + 1) * RACK_U_HEIGHT;
                        return (
                          <div
                            key={d.id}
                            style={{
                              position: 'absolute',
                              top: topOffset, left: 0, right: 0,
                              height: d.uHeight * RACK_U_HEIGHT,
                              background: (dt?.color ?? '#666') + '18',
                              border: `1px solid ${(dt?.color ?? '#666')}55`,
                              borderRadius: 3,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              pointerEvents: 'none', zIndex: 3,
                            }}
                          >
                            <span style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 9, color: dt?.color ?? '#666',
                            }}>
                              {d.name}
                            </span>
                          </div>
                        );
                      })}

                      {/* Ghost of device being placed */}
                      {rackU != null && template && !hasCollision(rackU) && (
                        <div style={{
                          position: 'absolute',
                          top: (activeRack.uHeight - rackU - template.uHeight + 1) * RACK_U_HEIGHT,
                          left: 0, right: 0,
                          height: template.uHeight * RACK_U_HEIGHT,
                          background: accent + '22',
                          border: `2px dashed ${accent}`,
                          borderRadius: 4,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          pointerEvents: 'none', zIndex: 4,
                        }}>
                          <span style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 10, color: accent, fontWeight: 600,
                          }}>
                            {info.name || `${template.make} ${template.model}`} ({template.uHeight}U)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!activeRack && rackId === '' && (
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  color: 'var(--text3, #4e5560)',
                }}>
                  select a rack or skip to create unracked
                </div>
              )}
            </div>
          )}

          {/* ── Step: Drives ───────────────────────────────────────────── */}
          {step === 'drives' && template && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  color: 'var(--text2, #8a9299)',
                }}>
                  {driveBlocks.length} drive bay{driveBlocks.length !== 1 ? 's' : ''} — assign drives to slots
                </span>
                {copySource && (
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                    color: accent, display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <Icon name="copy" size={9} color={accent} />
                    copied: {copySource.capacity} {copySource.driveType} — click a bay to paste
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {driveBlocks.map(block => {
                  const draft = getDriveDraft(block.id);
                  const isEmpty = !draft;
                  return (
                    <div
                      key={block.id}
                      style={{
                        background: draft ? 'var(--cardBg, #141618)' : 'transparent',
                        border: `1px solid ${draft ? 'var(--border2, #262c30)' : 'var(--border, #1d2022)'}`,
                        borderRadius: 6, padding: '8px 10px',
                      }}
                    >
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginBottom: draft ? 8 : 0,
                      }}>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                          color: 'var(--text2, #8a9299)',
                        }}>
                          {block.type} — {block.label || block.id.slice(0, 8)}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {copySource && isEmpty && (
                            <button
                              className="btn-ghost"
                              style={{ fontSize: 9, padding: '2px 8px' }}
                              onClick={() => handlePasteDrive(block.id)}
                            >
                              <Icon name="clipboard" size={9} /> paste
                            </button>
                          )}
                          {isEmpty ? (
                            <button
                              className="btn-ghost"
                              style={{ fontSize: 9, padding: '2px 8px' }}
                              onClick={() => setDriveDraft(block.id, {
                                blockId: block.id, label: '', capacity: '',
                                driveType: 'hdd', serial: '', isBoot: false,
                              })}
                            >
                              <Icon name="plus" size={9} /> add
                            </button>
                          ) : (
                            <>
                              <button
                                className="btn-ghost"
                                style={{ fontSize: 9, padding: '2px 8px' }}
                                onClick={() => handleCopyDrive(draft!)}
                              >
                                <Icon name="copy" size={9} /> copy
                              </button>
                              <button
                                className="btn-ghost"
                                style={{ fontSize: 9, padding: '2px 8px', color: 'var(--red, #c07070)' }}
                                onClick={() => removeDriveDraft(block.id)}
                              >
                                <Icon name="x" size={9} /> remove
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {draft && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <div className="wiz-field" style={{ flex: '1 1 80px' }}>
                            <label className="wiz-label">label</label>
                            <input
                              className="wiz-input"
                              value={draft.label}
                              onChange={e => setDriveDraft(block.id, { ...draft, label: e.target.value })}
                              placeholder="disk0"
                              style={{ fontSize: 10 }}
                            />
                          </div>
                          <div className="wiz-field" style={{ flex: '1 1 80px' }}>
                            <label className="wiz-label">capacity</label>
                            <input
                              className="wiz-input"
                              value={draft.capacity}
                              onChange={e => setDriveDraft(block.id, { ...draft, capacity: e.target.value })}
                              placeholder="4T"
                              style={{ fontSize: 10 }}
                            />
                          </div>
                          <div className="wiz-field" style={{ flex: '0 0 80px' }}>
                            <label className="wiz-label">type</label>
                            <select
                              className="wiz-input"
                              value={draft.driveType}
                              onChange={e => setDriveDraft(block.id, { ...draft, driveType: e.target.value as DriveType })}
                              style={{ fontSize: 10 }}
                            >
                              {DRIVE_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                            </select>
                          </div>
                          <div className="wiz-field" style={{ flex: '1 1 100px' }}>
                            <label className="wiz-label">serial</label>
                            <input
                              className="wiz-input"
                              value={draft.serial}
                              onChange={e => setDriveDraft(block.id, { ...draft, serial: e.target.value })}
                              placeholder="—"
                              style={{ fontSize: 10 }}
                            />
                          </div>
                          <label style={{
                            display: 'flex', alignItems: 'flex-end', gap: 4, paddingBottom: 4,
                            fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                            color: 'var(--text2, #8a9299)', cursor: 'pointer',
                          }}>
                            <input
                              type="checkbox"
                              checked={draft.isBoot}
                              onChange={e => setDriveDraft(block.id, { ...draft, isBoot: e.target.checked })}
                            />
                            boot
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Step: Ports ────────────────────────────────────────────── */}
          {step === 'ports' && template && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                color: 'var(--text2, #8a9299)',
              }}>
                {portBlocks.length} port{portBlocks.length !== 1 ? 's' : ''} — port assignments can be configured after deployment in the device editor
              </span>
              {/* Show template overlay with port blocks highlighted */}
              {(['front', 'rear'] as const).map(f => {
                const faceBlocks = (f === 'front' ? template.layout.front : template.layout.rear)
                  .filter(b => isPortBlock(b.type));
                if (faceBlocks.length === 0) return null;
                const gridCols = template.formFactor === 'rack' ? 96 : (template.gridCols ?? 96);
                const gridRows = template.formFactor === 'rack' ? template.uHeight * 12 : (template.gridRows ?? 12);
                return (
                  <div key={f}>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                      color: 'var(--text3, #4e5560)', marginBottom: 4,
                      textTransform: 'uppercase',
                    }}>
                      {f} — {faceBlocks.length} port{faceBlocks.length !== 1 ? 's' : ''}
                    </div>
                    <ErrorBoundary>
                      <TemplateOverlay
                        blocks={faceBlocks}
                        gridCols={gridCols}
                        gridRows={gridRows}
                        width={440}
                        showLabels
                      />
                    </ErrorBoundary>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Step: PCIe ─────────────────────────────────────────────── */}
          {step === 'pcie' && template && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                color: 'var(--text2, #8a9299)',
              }}>
                {pcieSlots.length} PCIe slot{pcieSlots.length !== 1 ? 's' : ''} — card assignments can be configured after deployment in the device editor
              </span>
              {(() => {
                const gridCols = template.formFactor === 'rack' ? 96 : (template.gridCols ?? 96);
                const gridRows = template.formFactor === 'rack' ? template.uHeight * 12 : (template.gridRows ?? 12);
                return (
                  <ErrorBoundary>
                    <TemplateOverlay
                      blocks={pcieSlots}
                      gridCols={gridCols}
                      gridRows={gridRows}
                      width={440}
                      showLabels
                    />
                  </ErrorBoundary>
                );
              })()}
            </div>
          )}

          {/* ── Step: Summary ──────────────────────────────────────────── */}
          {step === 'summary' && template && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                fontWeight: 700, color: 'var(--text, #d4d9dd)',
              }}>
                Deployment Summary
              </div>

              <div style={{
                background: 'var(--cardBg, #141618)',
                border: '1px solid var(--border2, #262c30)',
                borderRadius: 6, padding: '10px 14px',
                display: 'flex', flexDirection: 'column', gap: 6,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text3, #4e5560)' }}>template</span>
                  <span style={{ color: 'var(--text, #d4d9dd)' }}>{template.manufacturer ? `${template.manufacturer} ` : ''}{template.make} {template.model}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text3, #4e5560)' }}>name</span>
                  <span style={{ color: 'var(--text, #d4d9dd)' }}>{info.name || `${template.make} ${template.model}`}</span>
                </div>
                {info.ip && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text3, #4e5560)' }}>IP</span>
                    <span style={{ color: 'var(--text, #d4d9dd)' }}>{info.ip}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text3, #4e5560)' }}>rack</span>
                  <span style={{ color: 'var(--text, #d4d9dd)' }}>
                    {activeRack ? `${activeRack.name} U${rackU ?? '?'} (${face})` : 'unracked'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text3, #4e5560)' }}>drives</span>
                  <span style={{ color: 'var(--text, #d4d9dd)' }}>{driveDrafts.filter(d => d.capacity.trim()).length} of {driveBlocks.length} bays</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text3, #4e5560)' }}>ports</span>
                  <span style={{ color: 'var(--text, #d4d9dd)' }}>{portBlocks.length} (configure after deploy)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text3, #4e5560)' }}>PCIe</span>
                  <span style={{ color: 'var(--text, #d4d9dd)' }}>{pcieSlots.length} slots (configure after deploy)</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '0 18px 8px',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: 'var(--red, #c07070)',
          }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '11px 18px',
          borderTop: '1px solid var(--border2, #262c30)',
          display: 'flex', justifyContent: 'space-between', gap: 8,
          flexShrink: 0,
        }}>
          <div>
            {canBack && (
              <button className="btn-ghost" onClick={() => setStep(activeSteps[stepIdx - 1])}>Back</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            {step !== 'summary' ? (
              <button
                className="act-primary"
                style={{ ...av, opacity: canProceedFromStep(step) ? 1 : 0.5 }}
                disabled={!canProceedFromStep(step)}
                onClick={() => setStep(activeSteps[stepIdx + 1])}
              >
                Next
              </button>
            ) : (
              <>
                <button
                  className="btn-ghost"
                  style={{ color: 'var(--gold, #b89870)' }}
                  disabled={saving}
                  onClick={() => handleDeploy(true)}
                >
                  {saving ? 'Saving…' : 'Deploy to Blueprint'}
                </button>
                <button
                  className="act-primary"
                  style={av}
                  disabled={saving}
                  onClick={() => handleDeploy(false)}
                >
                  {saving ? 'Deploying…' : 'Deploy to Rack'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
