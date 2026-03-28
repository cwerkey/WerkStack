import { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from '../../../../components/ui/Icon';
import { ErrorBoundary } from '../../../../components/ui/ErrorBoundary';
import { TemplateOverlay } from '../../../../components/ui/TemplateOverlay';
import { PatchWizard } from '../cable_map/PatchWizard';
import { useRackStore } from '../../../../store/useRackStore';
import { useTemplateStore } from '../../../../store/useTemplateStore';
import { useTypesStore } from '../../../../store/useTypesStore';
import { api } from '../../../../utils/api';
import { BLOCK_DEF_MAP } from '@werkstack/shared';
import type { DeviceInstance, PlacedBlock, Connection, Drive, ModuleInstance, PcieTemplate } from '@werkstack/shared';

type EditorTab = 'info' | 'ports' | 'drives' | 'pcie';

const TABS: { key: EditorTab; label: string }[] = [
  { key: 'info',   label: 'Info' },
  { key: 'ports',  label: 'Ports' },
  { key: 'drives', label: 'Drives' },
  { key: 'pcie',   label: 'PCIe' },
];

interface DeviceEditorModalProps {
  open:          boolean;
  onClose:       () => void;
  device:        DeviceInstance | null;
  siteId:        string;
  accent:        string;
  renderAsPane?: boolean;  // When true, renders as inline pane instead of modal overlay
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

function filterBlocksByPredicate(blocks: PlacedBlock[], pred: (type: string) => boolean): PlacedBlock[] {
  return blocks.filter(b => pred(b.type));
}

/** Get connections where this device is src or dst */
function getDeviceConnections(deviceId: string, connections: Connection[]): Connection[] {
  return connections.filter(c => c.srcDeviceId === deviceId || c.dstDeviceId === deviceId);
}

/** Find connection for a specific block on a device */
function getBlockConnection(deviceId: string, blockId: string, connections: Connection[]): Connection | undefined {
  return connections.find(c =>
    (c.srcDeviceId === deviceId && c.srcBlockId === blockId) ||
    (c.dstDeviceId === deviceId && c.dstBlockId === blockId)
  );
}

/** Get drives assigned to a specific slot block */
function getDriveForSlot(deviceId: string, blockId: string, drives: Drive[]): Drive | undefined {
  return drives.find(d => d.deviceId === deviceId && d.slotBlockId === blockId);
}

// ── Port Context Menu ────────────────────────────────────────────────────────

interface PortCtxState {
  x: number;
  y: number;
  block: PlacedBlock;
  face: 'front' | 'rear';
}

// ── Main Component ───────────────────────────────────────────────────────────

export function DeviceEditorModal({ open, onClose, device, siteId, accent, renderAsPane }: DeviceEditorModalProps) {
  const [tab, setTab]     = useState<EditorTab>('info');
  const [f, setF]         = useState<InfoDraft>({ name: '', ip: '', serial: '', assetTag: '', notes: '', face: 'front', rackU: '' });
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState('');
  const [saved, setSaved] = useState(false);

  // Context menu state (shared across tabs)
  const [portCtx, setPortCtx] = useState<PortCtxState | null>(null);

  // Hover tooltip state
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; text: string } | null>(null);

  // PCIe modules (fetched on-demand)
  const [modules, setModules] = useState<ModuleInstance[]>([]);

  // Patch wizard state — used when "Assign cable path" is chosen from right-click menu
  const [patchWizardOpen, setPatchWizardOpen] = useState(false);
  const [patchWizardSourceBlock, setPatchWizardSourceBlock] = useState<{ deviceId: string; blockId: string; blockType: string } | null>(null);

  // PCIe card install picker state
  const [pciePickerSlot, setPciePickerSlot] = useState<PlacedBlock | null>(null);

  // Drive install/edit state
  const [driveEditorSlot, setDriveEditorSlot] = useState<{ block: PlacedBlock; existing?: Drive } | null>(null);

  const deviceTypes     = useTypesStore(s => s.deviceTypes);
  const deviceTemplates = useTemplateStore(s => s.deviceTemplates);
  const pcieTemplates   = useTemplateStore(s => s.pcieTemplates);
  const connections     = useRackStore(s => s.connections);
  const drives          = useRackStore(s => s.drives);
  const devices         = useRackStore(s => s.devices);

  const av = { '--accent': accent } as React.CSSProperties;

  useEffect(() => {
    if (!open || !device) return;
    setTab('info');
    setErr('');
    setSaved(false);
    setBusy(false);
    setPortCtx(null);
    setHoverInfo(null);
    setPatchWizardOpen(false);
    setPatchWizardSourceBlock(null);
    setPciePickerSlot(null);
    setDriveEditorSlot(null);
    setF({
      name:     device.name,
      ip:       device.ip ?? '',
      serial:   device.serial ?? '',
      assetTag: device.assetTag ?? '',
      notes:    device.notes ?? '',
      face:     device.face ?? 'front',
      rackU:    device.rackU ? String(device.rackU) : '',
    });
    // Fetch module instances for this device
    api.get<ModuleInstance[]>(`/api/sites/${siteId}/devices/${device.id}/modules`).then(setModules).catch(() => setModules([]));
  }, [open, device?.id]);

  // Close context menu on click outside
  useEffect(() => {
    if (!portCtx) return;
    const close = () => setPortCtx(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [portCtx]);

  // Connections for this device
  const deviceConns = useMemo(() => device ? getDeviceConnections(device.id, connections) : [], [device?.id, connections]);
  // Drives for this device
  const deviceDrives = useMemo(() => device ? drives.filter(d => d.deviceId === device.id) : [], [device?.id, drives]);

  if (!open || !device) return null;

  const template = device.templateId
    ? deviceTemplates.find(t => t.id === device.templateId)
    : undefined;
  const dt = deviceTypes.find(t => t.id === device.typeId);

  const set = <K extends keyof InfoDraft>(k: K, v: InfoDraft[K]) => {
    setF(p => ({ ...p, [k]: v }));
    setSaved(false);
  };

  // ── Info Tab Handlers ──────────────────────────────────────────────────────

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

  // ── Block overlay helpers ──────────────────────────────────────────────────

  function buildBlockColors(blockList: PlacedBlock[], mode: 'ports' | 'drives'): Record<string, string> {
    const colors: Record<string, string> = {};
    for (const b of blockList) {
      if (mode === 'ports') {
        const conn = getBlockConnection(device!.id, b.id, deviceConns);
        if (!conn) {
          // Empty port — use very dim fill
          colors[b.id] = '#0a0c0e';
        }
        // Connected ports keep their block def color
      } else if (mode === 'drives') {
        const drive = getDriveForSlot(device!.id, b.id, deviceDrives);
        if (!drive) {
          colors[b.id] = '#0a0c0e';
        } else if (drive.poolId) {
          // Find pool color
          // We'd need pools in store — for now use a subtle indicator
          colors[b.id] = '#1a2a1a';
        }
      }
    }
    return colors;
  }

  function buildBlockOpacity(blockList: PlacedBlock[], mode: 'ports' | 'drives'): Record<string, number> {
    const opac: Record<string, number> = {};
    for (const b of blockList) {
      if (mode === 'ports') {
        const conn = getBlockConnection(device!.id, b.id, deviceConns);
        if (!conn) opac[b.id] = 0.4;
      } else if (mode === 'drives') {
        const drive = getDriveForSlot(device!.id, b.id, deviceDrives);
        if (!drive) opac[b.id] = 0.4;
      }
    }
    return opac;
  }

  function buildBlockLabels(blockList: PlacedBlock[], mode: 'ports' | 'drives'): Record<string, string> {
    const labels: Record<string, string> = {};
    for (const b of blockList) {
      if (mode === 'drives') {
        const drive = getDriveForSlot(device!.id, b.id, deviceDrives);
        if (drive) {
          labels[b.id] = drive.label || drive.capacity || drive.driveType;
        } else {
          labels[b.id] = '—';
        }
      }
    }
    return labels;
  }

  // Hover handler for blocks
  function handleBlockHover(block: PlacedBlock, e: React.MouseEvent, mode: 'ports' | 'drives' | 'pcie') {
    let text = '';
    const def = BLOCK_DEF_MAP.get(block.type);
    const blockLabel = block.label || def?.label || block.type;

    if (mode === 'ports') {
      const conn = getBlockConnection(device!.id, block.id, deviceConns);
      if (conn) {
        const otherDeviceId = conn.srcDeviceId === device!.id ? conn.dstDeviceId : conn.srcDeviceId;
        const otherPort = conn.srcDeviceId === device!.id ? conn.dstPort : conn.srcPort;
        const otherDevice = devices.find(d => d.id === otherDeviceId);
        text = `${blockLabel} → ${otherDevice?.name ?? 'unknown'}${otherPort ? ` (${otherPort})` : ''}`;
        if (conn.label) text += ` [${conn.label}]`;
      } else {
        text = `${blockLabel} — empty`;
      }
    } else if (mode === 'drives') {
      const drive = getDriveForSlot(device!.id, block.id, deviceDrives);
      if (drive) {
        text = `${drive.label || 'drive'} — ${drive.capacity} ${drive.driveType}`;
        if (drive.serial) text += ` (${drive.serial})`;
      } else {
        text = `${blockLabel} — empty bay`;
      }
    } else if (mode === 'pcie') {
      const mod = modules.find(m => m.slotBlockId === block.id);
      if (mod) {
        const card = pcieTemplates.find(t => t.id === mod.cardTemplateId);
        text = card ? `${card.make} ${card.model}` : 'installed card';
        if (mod.serialNumber) text += ` (${mod.serialNumber})`;
      } else {
        text = `${blockLabel} — empty slot`;
      }
    }

    setHoverInfo({ x: e.clientX, y: e.clientY - 30, text });
  }

  // Right-click handler for port blocks
  function handlePortContextMenu(block: PlacedBlock, e: React.MouseEvent, face: 'front' | 'rear') {
    setPortCtx({ x: e.clientX, y: e.clientY, block, face });
  }

  // ── Port right-click menu actions ──────────────────────────────────────────

  async function handleSetPortName(block: PlacedBlock, name: string) {
    if (!template || !device) return;
    // Update block label in template layout
    const face = template.layout.front.some(b => b.id === block.id) ? 'front' : 'rear';
    const updatedBlocks = template.layout[face].map(b =>
      b.id === block.id ? { ...b, label: name || undefined } : b
    );
    const newLayout = { ...template.layout, [face]: updatedBlocks };
    try {
      const updated = await api.patch(`/api/templates/devices/${template.id}`, { layout: newLayout });
      useTemplateStore.getState().upsertDeviceTemplate(updated as any);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed to update port name');
    }
    setPortCtx(null);
  }

  function handleAssignCablePath(block: PlacedBlock) {
    setPatchWizardSourceBlock({
      deviceId: device!.id,
      blockId: block.id,
      blockType: block.type,
    });
    setPatchWizardOpen(true);
    setPortCtx(null);
  }

  // ── Panel rendering helper ─────────────────────────────────────────────────

  function renderPanel(
    face: 'front' | 'rear',
    blockFilter: (type: string) => boolean,
    mode: 'ports' | 'drives' | 'pcie',
  ) {
    if (!template) return null;
    const rawBlocks = face === 'front' ? template.layout.front : template.layout.rear;
    const filteredBlocks = filterBlocksByPredicate(rawBlocks, blockFilter);
    if (filteredBlocks.length === 0) return null;

    const gridCols = template.formFactor === 'rack' ? 96 : (template.gridCols ?? 96);
    const gridRows = template.formFactor === 'rack' ? template.uHeight * 12 : (template.gridRows ?? 12);

    return (
      <div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          color: 'var(--text2, #8a9299)', marginBottom: 4,
        }}>
          {face === 'front' ? 'Front panel' : 'Rear panel'} ({filteredBlocks.length})
        </div>
        <ErrorBoundary>
          <TemplateOverlay
            blocks={filteredBlocks}
            gridCols={gridCols}
            gridRows={gridRows}
            width={overlayWidth}
            showLabels
            interactive
            blockColors={buildBlockColors(filteredBlocks, mode === 'pcie' ? 'ports' : mode)}
            blockOpacity={buildBlockOpacity(filteredBlocks, mode === 'pcie' ? 'ports' : mode)}
            blockLabels={mode === 'drives' ? buildBlockLabels(filteredBlocks, 'drives') : undefined}
            onBlockMouseEnter={(b, e) => handleBlockHover(b, e, mode)}
            onBlockMouseLeave={() => setHoverInfo(null)}
            onBlockContextMenu={(b, e) => handlePortContextMenu(b, e, face)}
          />
        </ErrorBoundary>
      </div>
    );
  }


  // ── Pane mode rendering — inline in rack view right panel ──
  const panelWidth = renderAsPane ? undefined : 640;
  const panelStyle: React.CSSProperties = renderAsPane
    ? {
        background: 'var(--cardBg2, #0c0d0e)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        flex: 1, minHeight: 0,
      }
    : {
        background: 'var(--cardBg2, #0c0d0e)',
        border: '1px solid var(--border2, #262c30)',
        borderRadius: 14, width: panelWidth, maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 64px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      };

  const overlayWidth = renderAsPane ? 380 : 560;

  const content = (
    <>
      <div style={panelStyle} onMouseDown={e => e.stopPropagation()}>
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
                onClick={() => { setTab(t.key); setPortCtx(null); setHoverInfo(null); }}
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
                  <label className="wiz-label">rack rails</label>
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
                  {renderPanel('front', isPortBlock, 'ports')}
                  <div style={{ height: 8 }} />
                  {renderPanel('rear', isPortBlock, 'ports')}
                  {/* No port blocks at all */}
                  {filterBlocksByPredicate(template.layout.front, isPortBlock).length === 0 &&
                   filterBlocksByPredicate(template.layout.rear, isPortBlock).length === 0 && (
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                      color: 'var(--text3, #4e5560)', padding: '20px 0', textAlign: 'center',
                    }}>
                      no port blocks on this template
                    </div>
                  )}
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                    color: 'var(--text3, #4e5560)', marginTop: 4,
                  }}>
                    {deviceConns.length} connection{deviceConns.length !== 1 ? 's' : ''} — hover for details, right-click for options
                  </div>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {template ? (
                <>
                  {renderPanel('front', isDriveBlock, 'drives')}
                  <div style={{ height: 8 }} />
                  {renderPanel('rear', isDriveBlock, 'drives')}
                  {filterBlocksByPredicate(template.layout.front, isDriveBlock).length === 0 &&
                   filterBlocksByPredicate(template.layout.rear, isDriveBlock).length === 0 && (
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                      color: 'var(--text3, #4e5560)', padding: '20px 0', textAlign: 'center',
                    }}>
                      no drive bays on this template
                    </div>
                  )}
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                    color: 'var(--text3, #4e5560)', marginTop: 4,
                  }}>
                    {deviceDrives.length} drive{deviceDrives.length !== 1 ? 's' : ''} installed — hover for details, right-click for options
                  </div>
                </>
              ) : (
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  color: 'var(--text3, #4e5560)', padding: '20px 0', textAlign: 'center',
                }}>
                  no template assigned — drive layout unavailable
                </div>
              )}
            </div>
          )}

          {/* ── PCIe tab ──────────────────────────────────────────────── */}
          {tab === 'pcie' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {template ? (() => {
                const pcieSlots = filterBlocksByPredicate(template.layout.rear, isPcieSlot);
                if (pcieSlots.length === 0) {
                  return (
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                      color: 'var(--text3, #4e5560)', padding: '20px 0', textAlign: 'center',
                    }}>
                      no PCIe slots on this template
                    </div>
                  );
                }

                const gridCols = template.formFactor === 'rack' ? 96 : (template.gridCols ?? 96);
                const gridRows = template.formFactor === 'rack' ? template.uHeight * 12 : (template.gridRows ?? 12);

                // Build opacity/colors for PCIe slots
                const slotOpacity: Record<string, number> = {};
                const slotColors: Record<string, string> = {};
                const slotLabels: Record<string, string> = {};
                for (const slot of pcieSlots) {
                  const mod = modules.find(m => m.slotBlockId === slot.id);
                  if (mod) {
                    const card = pcieTemplates.find(t => t.id === mod.cardTemplateId);
                    slotLabels[slot.id] = card ? `${card.make} ${card.model}` : 'installed';
                    slotColors[slot.id] = '#1a2a3a';
                  } else {
                    slotOpacity[slot.id] = 0.4;
                    slotLabels[slot.id] = 'empty';
                  }
                }

                return (
                  <>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                      color: 'var(--text2, #8a9299)', marginBottom: 4,
                    }}>
                      Rear panel — {pcieSlots.length} PCIe slot{pcieSlots.length !== 1 ? 's' : ''}
                    </div>
                    <ErrorBoundary>
                      <TemplateOverlay
                        blocks={pcieSlots}
                        gridCols={gridCols}
                        gridRows={gridRows}
                        width={overlayWidth}
                        showLabels
                        interactive
                        blockColors={slotColors}
                        blockOpacity={slotOpacity}
                        blockLabels={slotLabels}
                        onBlockMouseEnter={(b, e) => handleBlockHover(b, e, 'pcie')}
                        onBlockMouseLeave={() => setHoverInfo(null)}
                        onBlockContextMenu={(b, e) => handlePortContextMenu(b, e, 'rear')}
                      />
                    </ErrorBoundary>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                      color: 'var(--text3, #4e5560)', marginTop: 4,
                    }}>
                      {modules.length} card{modules.length !== 1 ? 's' : ''} installed — hover for details, right-click for options
                    </div>
                  </>
                );
              })() : (
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                  color: 'var(--text3, #4e5560)', padding: '20px 0', textAlign: 'center',
                }}>
                  no template assigned — PCIe layout unavailable
                </div>
              )}
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

      {/* ── Hover tooltip ──────────────────────────────────────────────── */}
      {hoverInfo && (
        <div style={{
          position: 'fixed',
          left: hoverInfo.x,
          top: hoverInfo.y,
          transform: 'translateX(-50%)',
          zIndex: 2000,
          background: 'var(--cardBg, #141618)',
          border: '1px solid var(--border2, #262c30)',
          borderRadius: 4,
          padding: '4px 8px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: 'var(--text, #d4d9dd)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}>
          {hoverInfo.text}
        </div>
      )}

      {/* ── Block context menu ─────────────────────────────────────────── */}
      {portCtx && (
        <BlockActionMenu
          block={portCtx.block}
          face={portCtx.face}
          x={portCtx.x}
          y={portCtx.y}
          device={device}
          siteId={siteId}
          connections={deviceConns}
          drives={deviceDrives}
          modules={modules}
          pcieTemplates={pcieTemplates}
          onClose={() => setPortCtx(null)}
          onAssignCablePath={handleAssignCablePath}
          onSetPortName={handleSetPortName}
          onRefreshModules={() => {
            api.get<ModuleInstance[]>(`/api/sites/${siteId}/devices/${device.id}/modules`).then(setModules).catch(() => {});
          }}
          onInstallPcieCard={(slot) => { setPortCtx(null); setPciePickerSlot(slot); }}
          onInstallDrive={(block, existing) => { setPortCtx(null); setDriveEditorSlot({ block, existing }); }}
        />
      )}

      {/* ── Patch Wizard overlay ────────────────────────────────────────── */}
      {patchWizardOpen && patchWizardSourceBlock && (
        <PatchWizard
          siteId={siteId}
          initial={{
            id:           '',
            orgId:        '',
            siteId,
            srcDeviceId:  patchWizardSourceBlock.deviceId,
            srcBlockId:   patchWizardSourceBlock.blockId,
            srcBlockType: patchWizardSourceBlock.blockType,
            dstDeviceId:  '',
            createdAt:    '',
          }}
          onSave={(conn) => {
            useRackStore.getState().upsertConnection(conn);
            setPatchWizardOpen(false);
            setPatchWizardSourceBlock(null);
          }}
          onClose={() => { setPatchWizardOpen(false); setPatchWizardSourceBlock(null); }}
        />
      )}

      {/* ── PCIe Card Picker ────────────────────────────────────────────── */}
      {pciePickerSlot && (
        <PcieCardPicker
          slot={pciePickerSlot}
          device={device}
          siteId={siteId}
          pcieTemplates={pcieTemplates}
          modules={modules}
          onInstall={(mod) => { setModules(prev => [...prev, mod]); setPciePickerSlot(null); }}
          onClose={() => setPciePickerSlot(null)}
        />
      )}

      {/* ── Drive Editor ────────────────────────────────────────────────── */}
      {driveEditorSlot && (
        <DriveEditor
          slot={driveEditorSlot.block}
          existing={driveEditorSlot.existing}
          device={device}
          siteId={siteId}
          onSave={(drive) => {
            useRackStore.getState().upsertDrive(drive);
            setDriveEditorSlot(null);
          }}
          onClose={() => setDriveEditorSlot(null)}
        />
      )}
    </>
  );

  // Pane mode: render inline content directly (no overlay)
  if (renderAsPane) return content;

  // Modal mode: wrap in overlay
  return (
    <div className="modal-overlay">
      {content}
    </div>
  );
}

// ── Block Action Menu (right-click) ──────────────────────────────────────────

interface BlockActionMenuProps {
  block:          PlacedBlock;
  face:           'front' | 'rear';
  x:              number;
  y:              number;
  device:         DeviceInstance;
  siteId:         string;
  connections:    Connection[];
  drives:         Drive[];
  modules:        ModuleInstance[];
  pcieTemplates:  PcieTemplate[];
  onClose:        () => void;
  onAssignCablePath: (block: PlacedBlock) => void;
  onSetPortName:     (block: PlacedBlock, name: string) => void;
  onRefreshModules:  () => void;
  onInstallPcieCard: (slot: PlacedBlock) => void;
  onInstallDrive:    (block: PlacedBlock, existing?: Drive) => void;
}

function BlockActionMenu({
  block, face, x, y, device, siteId, connections, drives, modules, pcieTemplates,
  onClose, onAssignCablePath, onSetPortName, onRefreshModules, onInstallPcieCard, onInstallDrive,
}: BlockActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [editLabel, setEditLabel] = useState(block.label ?? '');
  const def = BLOCK_DEF_MAP.get(block.type);
  const blockLabel = block.label || def?.label || block.type;

  const isPort = isPortBlock(block.type);
  const isDrive = isDriveBlock(block.type);
  const isPcie = isPcieSlot(block.type);

  const conn = isPort ? getBlockConnection(device.id, block.id, connections) : undefined;
  const drive = isDrive ? getDriveForSlot(device.id, block.id, drives) : undefined;
  const mod = isPcie ? modules.find(m => m.slotBlockId === block.id) : undefined;

  // Position adjustment
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      let nx = x, ny = y;
      if (x + rect.width > window.innerWidth - 8) nx = window.innerWidth - rect.width - 8;
      if (y + rect.height > window.innerHeight - 8) ny = window.innerHeight - rect.height - 8;
      setPos({ x: nx, y: ny });
    }
  }, [x, y]);

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  const menuStyle: React.CSSProperties = {
    position: 'fixed', left: pos.x, top: pos.y, zIndex: 2000,
    minWidth: 240,
    background: 'var(--cardBg, #141618)',
    border: '1px solid var(--border2, #262c30)',
    borderRadius: 6,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    padding: '6px 0',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
    color: 'var(--text, #d4d9dd)',
  };

  const sectionStyle: React.CSSProperties = {
    padding: '4px 12px', fontSize: 9, color: 'var(--text3, #4e5560)',
    textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700,
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px',
  };

  const inputStyle: React.CSSProperties = {
    flex: 1, padding: '3px 6px',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
    background: 'var(--inputBg, #1a1d20)',
    border: '1px solid var(--border2, #262c30)',
    borderRadius: 3, color: 'var(--text, #d4d9dd)', outline: 'none',
  };

  const btnStyle: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '5px 12px',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
    color: 'var(--text, #d4d9dd)',
    background: 'transparent', border: 'none', cursor: 'pointer',
  };

  return (
    <div ref={menuRef} style={menuStyle} onClick={stopProp}>
      {/* Header */}
      <div style={{
        padding: '4px 12px 6px',
        borderBottom: '1px solid var(--border, #1d2022)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontWeight: 700, color: 'var(--accent, #c47c5a)', fontSize: 10 }}>
          {blockLabel}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text3, #4e5560)' }}>
          {face} · {block.w}×{block.h}
        </span>
      </div>

      {/* Port name */}
      <div style={sectionStyle}>Port Name</div>
      <div style={rowStyle}>
        <input
          style={inputStyle}
          value={editLabel}
          onChange={e => setEditLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { onSetPortName(block, editLabel); } }}
          placeholder={def?.label ?? 'unnamed'}
        />
        <button
          style={{ ...btnStyle, width: 'auto', padding: '2px 8px', fontSize: 9, border: '1px solid var(--border2, #262c30)', borderRadius: 3 }}
          onClick={() => onSetPortName(block, editLabel)}
        >
          set
        </button>
      </div>

      {/* Port-specific actions */}
      {isPort && (
        <>
          <div style={{ borderTop: '1px solid var(--border, #1d2022)', marginTop: 4, paddingTop: 4 }}>
            <button
              style={btnStyle}
              onClick={() => onAssignCablePath(block)}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--inputBg, #1a1d20)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {conn ? 'Edit cable path…' : 'Assign cable path…'}
            </button>
          </div>
          {conn && (
            <div style={{ padding: '2px 12px', fontSize: 9, color: 'var(--text3, #4e5560)' }}>
              connected: {conn.label || `${conn.srcBlockType ?? ''} → ${conn.dstBlockType ?? ''}`}
            </div>
          )}
          {def?.isNet && block.type.startsWith('sfp') && (
            <button
              style={btnStyle}
              onClick={() => { /* TODO: open sled assignment from ledger */ onClose(); }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--inputBg, #1a1d20)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Assign SFP sled…
            </button>
          )}
        </>
      )}

      {/* Drive-specific actions */}
      {isDrive && (
        <div style={{ borderTop: '1px solid var(--border, #1d2022)', marginTop: 4, paddingTop: 4 }}>
          {drive ? (
            <>
              <div style={{ padding: '2px 12px', fontSize: 9, color: 'var(--text2, #8a9299)' }}>
                {drive.label || 'drive'} — {drive.capacity} {drive.driveType}
              </div>
              <button
                style={btnStyle}
                onClick={() => onInstallDrive(block, drive)}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--inputBg, #1a1d20)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                Edit drive details…
              </button>
            </>
          ) : (
            <button
              style={btnStyle}
              onClick={() => onInstallDrive(block)}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--inputBg, #1a1d20)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Install drive…
            </button>
          )}
        </div>
      )}

      {/* PCIe-specific actions */}
      {isPcie && (
        <div style={{ borderTop: '1px solid var(--border, #1d2022)', marginTop: 4, paddingTop: 4 }}>
          {mod ? (() => {
            const card = pcieTemplates.find(t => t.id === mod.cardTemplateId);
            return (
              <>
                <div style={{ padding: '2px 12px', fontSize: 9, color: 'var(--text2, #8a9299)' }}>
                  {card ? `${card.make} ${card.model}` : 'installed card'}
                  {mod.serialNumber ? ` — ${mod.serialNumber}` : ''}
                </div>
                <button
                  style={{ ...btnStyle, color: 'var(--red, #c07070)' }}
                  onClick={async () => {
                    try {
                      await api.delete(`/api/sites/${siteId}/devices/${device.id}/modules/${mod.id}`);
                      onRefreshModules();
                    } catch {}
                    onClose();
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--inputBg, #1a1d20)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  Remove card
                </button>
              </>
            );
          })() : (
            <button
              style={btnStyle}
              onClick={() => onInstallPcieCard(block)}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--inputBg, #1a1d20)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Install PCIe card…
            </button>
          )}

          {/* Fit validation info */}
          {!mod && (() => {
            const slotW = block.type === 'pcie-dw' ? 2 : 1;
            const slotDepth = block.h;
            return (
              <div style={{ padding: '2px 12px', fontSize: 9, color: 'var(--text3, #4e5560)' }}>
                slot: {slotW === 2 ? 'double-width' : 'single'}, depth {slotDepth} rows
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ── PCIe Card Picker ──────────────────────────────────────────────────────────

interface PcieCardPickerProps {
  slot:          PlacedBlock;
  device:        DeviceInstance;
  siteId:        string;
  pcieTemplates: PcieTemplate[];
  modules:       ModuleInstance[];
  onInstall:     (mod: ModuleInstance) => void;
  onClose:       () => void;
}

function PcieCardPicker({ slot, device, siteId, pcieTemplates, onInstall, onClose }: PcieCardPickerProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const slotFormFactor = slot.type === 'pcie-dw' ? 'dw' : slot.type === 'pcie-lp' ? 'lp' : 'fh';
  const slotDepth = slot.h;

  // Fit validation: card must fit the slot
  // - fh slot accepts fh and lp cards
  // - lp slot accepts only lp cards
  // - dw slot accepts dw cards (double-width)
  // - card laneDepth must be ≤ slot depth (block.h in grid rows)
  function cardFits(card: PcieTemplate): { fits: boolean; reason?: string } {
    if (slotFormFactor === 'dw') {
      if (card.formFactor !== 'dw') return { fits: false, reason: 'slot requires double-width card' };
    } else if (slotFormFactor === 'lp') {
      if (card.formFactor !== 'lp') return { fits: false, reason: 'slot only fits low-profile cards' };
    } else {
      // fh slot: accepts fh or lp, not dw
      if (card.formFactor === 'dw') return { fits: false, reason: 'double-width card needs a dw slot' };
    }
    if (card.laneDepth > slotDepth) {
      return { fits: false, reason: `card depth (${card.laneDepth}) exceeds slot depth (${slotDepth})` };
    }
    return { fits: true };
  }

  async function handleInstall(card: PcieTemplate) {
    setSaving(true);
    setError('');
    try {
      const mod = await api.post<ModuleInstance>(`/api/sites/${siteId}/devices/${device.id}/modules`, {
        slotBlockId: slot.id,
        cardTemplateId: card.id,
      });
      onInstall(mod);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'install failed');
      setSaving(false);
    }
  }

  const panelStyle: React.CSSProperties = {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    zIndex: 2100, minWidth: 380, maxWidth: 480, maxHeight: 'calc(100vh - 64px)',
    background: 'var(--cardBg, #141618)', border: '1px solid var(--border2, #262c30)',
    borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 2050, background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border, #1d2022)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: 'var(--text, #d4d9dd)' }}>
            Install PCIe Card
          </span>
          <button className="modal-close-btn" onClick={onClose}><Icon name="x" size={10} /></button>
        </div>
        <div style={{
          padding: '8px 16px', fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
          color: 'var(--text3, #4e5560)', borderBottom: '1px solid var(--border, #1d2022)',
        }}>
          slot: {slotFormFactor === 'dw' ? 'double-width' : slotFormFactor === 'lp' ? 'low-profile' : 'full-height'}, depth {slotDepth} rows
        </div>
        <div style={{ padding: '8px 0', overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {pcieTemplates.length === 0 ? (
            <div style={{
              padding: '20px 16px', textAlign: 'center',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text3, #4e5560)',
            }}>
              no PCIe card templates — create one in the device library first
            </div>
          ) : (
            pcieTemplates.map(card => {
              const fit = cardFits(card);
              return (
                <button
                  key={card.id}
                  disabled={!fit.fits || saving}
                  onClick={() => handleInstall(card)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '6px 16px', gap: 8,
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                    color: fit.fits ? 'var(--text, #d4d9dd)' : 'var(--text3, #4e5560)',
                    background: 'transparent', border: 'none', cursor: fit.fits ? 'pointer' : 'not-allowed',
                    opacity: fit.fits ? 1 : 0.5, textAlign: 'left',
                  }}
                  onMouseEnter={e => { if (fit.fits) e.currentTarget.style.background = 'var(--inputBg, #1a1d20)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div>
                    <div>{card.make} {card.model}</div>
                    <div style={{ fontSize: 9, color: 'var(--text3, #4e5560)' }}>
                      {card.formFactor.toUpperCase()} · {card.busSize} · depth {card.laneDepth}
                      {!fit.fits && ` — ${fit.reason}`}
                    </div>
                  </div>
                  {fit.fits && <Icon name="plus" size={10} />}
                </button>
              );
            })
          )}
        </div>
        {error && (
          <div style={{
            padding: '6px 16px', fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--red, #c07070)', borderTop: '1px solid var(--border, #1d2022)',
          }}>
            {error}
          </div>
        )}
      </div>
    </>
  );
}

// ── Drive Editor ──────────────────────────────────────────────────────────────

type DriveType = 'hdd' | 'ssd' | 'nvme' | 'flash' | 'tape';
const DRIVE_TYPES: DriveType[] = ['hdd', 'ssd', 'nvme', 'flash', 'tape'];

interface DriveEditorProps {
  slot:      PlacedBlock;
  existing?: Drive;
  device:    DeviceInstance;
  siteId:    string;
  onSave:    (drive: Drive) => void;
  onClose:   () => void;
}

function DriveEditor({ slot, existing, device, siteId, onSave, onClose }: DriveEditorProps) {
  const [label, setLabel]       = useState(existing?.label ?? '');
  const [capacity, setCapacity] = useState(existing?.capacity ?? '');
  const [driveType, setDriveType] = useState<DriveType>(existing?.driveType ?? 'ssd');
  const [serial, setSerial]     = useState(existing?.serial ?? '');
  const [isBoot, setIsBoot]     = useState(existing?.isBoot ?? false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  async function handleSave() {
    if (!capacity.trim()) { setError('capacity is required'); return; }
    setSaving(true);
    setError('');
    try {
      const body = {
        deviceId: device.id,
        slotBlockId: slot.id,
        label: label.trim() || undefined,
        capacity: capacity.trim(),
        driveType,
        serial: serial.trim() || undefined,
        isBoot,
      };
      const drive = existing
        ? await api.patch<Drive>(`/api/sites/${siteId}/drives/${existing.id}`, body)
        : await api.post<Drive>(`/api/sites/${siteId}/drives`, body);
      onSave(drive);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!existing) return;
    if (!confirm('Remove this drive?')) return;
    try {
      await api.delete(`/api/sites/${siteId}/drives/${existing.id}`);
      useRackStore.getState().removeDrive(existing.id);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'delete failed');
    }
  }

  const panelStyle: React.CSSProperties = {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    zIndex: 2100, width: 380, maxHeight: 'calc(100vh - 64px)',
    background: 'var(--cardBg, #141618)', border: '1px solid var(--border2, #262c30)',
    borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 2050, background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border, #1d2022)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: 'var(--text, #d4d9dd)' }}>
            {existing ? 'Edit Drive' : 'Install Drive'}
          </span>
          <button className="modal-close-btn" onClick={onClose}><Icon name="x" size={10} /></button>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="wiz-field">
            <label className="wiz-label">label</label>
            <input className="wiz-input" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. disk0, sda" />
          </div>
          <div className="wiz-grid2">
            <div className="wiz-field">
              <label className="wiz-label">capacity</label>
              <input className="wiz-input" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="e.g. 4T, 960G" />
            </div>
            <div className="wiz-field">
              <label className="wiz-label">type</label>
              <select
                className="wiz-input"
                value={driveType}
                onChange={e => setDriveType(e.target.value as DriveType)}
              >
                {DRIVE_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
            </div>
          </div>
          <div className="wiz-field">
            <label className="wiz-label">serial number</label>
            <input className="wiz-input" value={serial} onChange={e => setSerial(e.target.value)} placeholder="—" />
          </div>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text2, #8a9299)',
            cursor: 'pointer',
          }}>
            <input type="checkbox" checked={isBoot} onChange={e => setIsBoot(e.target.checked)} />
            boot drive
          </label>
          {error && (
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--red, #c07070)' }}>
              {error}
            </div>
          )}
        </div>
        <div style={{
          padding: '10px 16px', borderTop: '1px solid var(--border, #1d2022)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {existing ? (
            <button
              className="btn-ghost"
              style={{ color: 'var(--red, #c07070)', fontSize: 10, padding: '3px 10px' }}
              onClick={handleRemove}
            >
              <Icon name="trash" size={10} /> remove
            </button>
          ) : <div />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={onClose}>cancel</button>
            <button className="act-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'saving…' : existing ? 'save' : 'install'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
