import { useState, useMemo, useRef, useCallback } from 'react';
import { useRackStore }     from '../../../../store/useRackStore';
import { useTypesStore }    from '../../../../store/useTypesStore';
import { useTemplateStore } from '../../../../store/useTemplateStore';
import { useThemeStore, OS_THEME_TOKENS, type OsThemeTokens } from '../../../../store/useThemeStore';
import { TemplateOverlay }  from '../../../../components/ui/TemplateOverlay';
import { api }              from '../../../../utils/api';
import { BLOCK_DEF_MAP } from '@werkstack/shared';
import type { Connection, DeviceInstance, DeviceTemplate, PlacedBlock, CableType } from '@werkstack/shared';

// ── Medium helpers ───────────────────────────────────────────────────────────
const FIBER_TYPES  = new Set(['sfp', 'sfp+', 'sfp28', 'qsfp', 'qsfp28']);
const COPPER_TYPES = new Set(['rj45']);

function getPortMedium(blockType: string): string {
  if (FIBER_TYPES.has(blockType))  return 'fiber';
  if (COPPER_TYPES.has(blockType)) return 'copper';
  return 'other';
}

function hasMismatch(a: string, b: string): boolean {
  const ma = getPortMedium(a);
  const mb = getPortMedium(b);
  if (ma === 'other' || mb === 'other') return false;
  return ma !== mb;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Check if a block is a port (network or peripheral) */
function isPortBlock(type: string): boolean {
  const def = BLOCK_DEF_MAP.get(type);
  return !!def && (def.isNet || def.isPort);
}

/** Find all connections for a given device + block */
function findBlockConnections(
  conns: Connection[],
  deviceId: string,
  blockId: string
): Connection[] {
  return conns.filter(c =>
    (c.srcDeviceId === deviceId && c.srcBlockId === blockId) ||
    (c.dstDeviceId === deviceId && c.dstBlockId === blockId)
  );
}

/** Get cable type color for a connected port */
function getConnCableColor(
  conn: Connection,
  cableTypes: CableType[]
): string | undefined {
  if (!conn.cableTypeId) return undefined;
  return cableTypes.find(ct => ct.id === conn.cableTypeId)?.color;
}

/** Check if device has any port blocks in its template */
function deviceHasPorts(device: DeviceInstance, templates: DeviceTemplate[]): boolean {
  if (!device.templateId) return false;
  const tpl = templates.find(t => t.id === device.templateId);
  if (!tpl) return false;
  return tpl.layout.front.some(b => isPortBlock(b.type)) ||
         tpl.layout.rear.some(b => isPortBlock(b.type));
}

// ── Port selection state ─────────────────────────────────────────────────────
interface PortSelection {
  deviceId: string;
  blockId:  string;
  blockType: string;
  label:    string;
}

// ── Editor popup state ───────────────────────────────────────────────────────
interface EditorState {
  src:              PortSelection;
  dst:              PortSelection;
  cableTypeId:      string;
  label:            string;
  notes:            string;
  mismatch:         boolean;
  overrideOccupied: boolean;
  isExternal:       boolean;
  externalLabel:    string;
}

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  siteId:              string;
  accent:              string;
  connections:         Connection[];
  onConnectionCreated: (conn: Connection) => void;
  onConnectionRemoved: (id: string) => void;
}

// ── Device Strip ─────────────────────────────────────────────────────────────
function DeviceStrip({
  position,
  deviceId,
  onDeviceChange,
  panel,
  onPanelChange,
  filteredDevices,
  templates,
  connections,
  cableTypes,
  accent,
  selectedPort,
  onPortClick,
  th,
}: {
  position:       'top' | 'bottom';
  deviceId:       string;
  onDeviceChange: (id: string) => void;
  panel:          'front' | 'rear';
  onPanelChange:  (p: 'front' | 'rear') => void;
  filteredDevices: DeviceInstance[];
  templates:      DeviceTemplate[];
  connections:    Connection[];
  cableTypes:     CableType[];
  accent:         string;
  selectedPort:   PortSelection | null;
  onPortClick:    (deviceId: string, block: PlacedBlock, tpl: DeviceTemplate) => void;
  th:             OsThemeTokens;
}) {
  const device = filteredDevices.find(d => d.id === deviceId);
  const tpl    = device?.templateId ? templates.find(t => t.id === device.templateId) : undefined;

  const panelBlocks = tpl ? tpl.layout[panel] : [];
  const gridCols    = tpl?.gridCols ?? 96;
  const gridRows    = tpl ? (panel === 'front' || panel === 'rear' ? (tpl.uHeight * 12) : (tpl.gridRows ?? 12)) : 12;

  // Build block overrides: ports at full opacity with cable color, non-ports ghosted
  const blockColors       = useMemo(() => {
    if (!tpl || !device) return {};
    const colors: Record<string, string> = {};
    for (const b of panelBlocks) {
      if (isPortBlock(b.type)) {
        const blockConns = findBlockConnections(connections, device.id, b.id);
        if (blockConns.length > 0) {
          const cableColor = getConnCableColor(blockConns[0], cableTypes);
          if (cableColor) colors[b.id] = cableColor;
        }
      }
    }
    return colors;
  }, [tpl, device, panelBlocks, connections, cableTypes]);

  const blockOpacity = useMemo(() => {
    if (!tpl) return {};
    const opac: Record<string, number> = {};
    for (const b of panelBlocks) {
      if (!isPortBlock(b.type)) {
        opac[b.id] = 0.15; // ghost non-port blocks
      } else if (device) {
        const blockConns = findBlockConnections(connections, device.id, b.id);
        opac[b.id] = blockConns.length > 0 ? 1 : 0.35;
      }
    }
    return opac;
  }, [tpl, device, panelBlocks, connections]);

  const blockBorderColors = useMemo(() => {
    if (!selectedPort || !device) return {};
    const borders: Record<string, string> = {};
    if (selectedPort.deviceId === device.id) {
      borders[selectedPort.blockId] = accent;
    }
    return borders;
  }, [selectedPort, device, accent]);

  const containerRef = useRef<HTMLDivElement>(null);
  const overlayWidth = 600;

  const inputStyle: React.CSSProperties = {
    padding: '5px 10px', borderRadius: 4,
    border: `1px solid ${th.border2}`, background: th.inputBg,
    color: th.text, fontFamily: th.fontData, fontSize: 12,
    outline: 'none',
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '12px 16px',
      borderBottom: position === 'top' ? `1px solid ${th.border}` : undefined,
      borderTop:    position === 'bottom' ? `1px solid ${th.border}` : undefined,
    }}>
      {/* Device picker row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3, minWidth: 60 }}>
          {position === 'top' ? 'source' : 'destination'}
        </span>
        <select
          style={{ ...inputStyle, flex: 1, maxWidth: 300 }}
          value={deviceId}
          onChange={e => onDeviceChange(e.target.value)}
        >
          <option value="">— select device —</option>
          {filteredDevices.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        {/* Front/Rear toggle */}
        {tpl && (
          <div style={{ display: 'flex', gap: 0, marginLeft: 8 }}>
            {(['front', 'rear'] as const).map(p => (
              <button
                key={p}
                className={`rpill${panel === p ? ' on' : ''}`}
                style={panel === p ? { background: accent, color: '#0c0d0e', borderRadius: p === 'front' ? '4px 0 0 4px' : '0 4px 4px 0' } : { borderRadius: p === 'front' ? '4px 0 0 4px' : '0 4px 4px 0' }}
                onClick={() => onPanelChange(p)}
              >{p}</button>
            ))}
          </div>
        )}

        {device && tpl && (
          <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3, marginLeft: 8 }}>
            {tpl.make} {tpl.model}
          </span>
        )}
      </div>

      {/* Device visual */}
      {device && tpl ? (
        <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
          <TemplateOverlay
            blocks={panelBlocks}
            gridCols={gridCols}
            gridRows={gridRows}
            width={overlayWidth}
            interactive
            showLabels
            blockColors={blockColors}
            blockBorderColors={blockBorderColors}
            blockOpacity={blockOpacity}
            onBlockClick={(block) => {
              if (isPortBlock(block.type)) {
                onPortClick(device.id, block, tpl);
              }
            }}
          />
        </div>
      ) : deviceId ? (
        <div style={{ padding: '20px 0', textAlign: 'center', fontFamily: th.fontLabel, fontSize: 11, color: th.text3 }}>
          device has no template
        </div>
      ) : (
        <div style={{ padding: '20px 0', textAlign: 'center', fontFamily: th.fontLabel, fontSize: 11, color: th.text3 }}>
          select a device to view ports
        </div>
      )}
    </div>
  );
}

// ── Connection Editor Popup ──────────────────────────────────────────────────
function ConnectionEditor({
  editor,
  setEditor,
  siteId,
  accent,
  onSave,
  onClose,
  th,
  cableTypes,
}: {
  editor:     EditorState;
  setEditor:  (fn: (prev: EditorState) => EditorState) => void;
  siteId:     string;
  accent:     string;
  onSave:     (conn: Connection) => void;
  onClose:    () => void;
  th:         typeof OS_THEME_TOKENS['homelab-dark'];
  cableTypes: CableType[];
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 10px', borderRadius: 4,
    border: `1px solid ${th.border2}`, background: th.inputBg,
    color: th.text, fontFamily: th.fontData, fontSize: 12,
    outline: 'none',
  };

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const body = editor.isExternal ? {
        srcDeviceId:   editor.src.deviceId,
        srcPort:       editor.src.label || undefined,
        srcBlockId:    editor.src.blockId || undefined,
        srcBlockType:  editor.src.blockType || undefined,
        externalLabel: editor.externalLabel || 'Internet',
        cableTypeId:   editor.cableTypeId || undefined,
        label:         editor.label || undefined,
        notes:         editor.notes || undefined,
      } : {
        srcDeviceId:  editor.src.deviceId,
        srcPort:      editor.src.label || undefined,
        srcBlockId:   editor.src.blockId || undefined,
        srcBlockType: editor.src.blockType || undefined,
        dstDeviceId:  editor.dst.deviceId,
        dstPort:      editor.dst.label || undefined,
        dstBlockId:   editor.dst.blockId || undefined,
        dstBlockType: editor.dst.blockType || undefined,
        cableTypeId:  editor.cableTypeId || undefined,
        label:        editor.label || undefined,
        notes:        editor.notes || undefined,
      };
      const conn = await api.post<Connection>(`/api/sites/${siteId}/connections`, body);
      onSave(conn);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
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
          <span style={{ fontFamily: th.fontMain, fontSize: 13, color: th.text }}>
            new connection
          </span>
          <button
            style={{ color: th.text3, fontFamily: th.fontLabel, fontSize: 12, cursor: 'pointer' }}
            onClick={onClose}
          >✕</button>
        </div>

        {/* Summary */}
        <div style={{ padding: '12px 16px' }}>
          <div style={{
            padding: '8px 12px', borderRadius: 4, background: th.rowBg,
            border: `1px solid ${th.border2}`, fontFamily: th.fontData, fontSize: 12,
            marginBottom: 12,
          }}>
            <span style={{ color: accent }}>{editor.src.label}</span>
            <span style={{ color: th.text3, margin: '0 8px' }}>→</span>
            <span style={{ color: accent }}>
              {editor.isExternal ? (editor.externalLabel || 'Internet') : editor.dst.label}
            </span>
          </div>

          {/* Mismatch warning */}
          {editor.mismatch && (
            <div style={{
              padding: '8px 12px', borderRadius: 4, marginBottom: 12,
              background: `${th.red}22`, border: `1px solid ${th.red}`,
              fontFamily: th.fontLabel, fontSize: 11, color: th.red,
            }}>
              ⚠ medium mismatch: connecting {getPortMedium(editor.src.blockType)} to {getPortMedium(editor.dst.blockType)}
            </div>
          )}

          {/* Cable type */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontFamily: th.fontLabel, fontSize: 10, color: th.text3, marginBottom: 4 }}>
              cable type
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              <button
                style={{
                  padding: '4px 10px', borderRadius: 999, fontSize: 10,
                  fontFamily: th.fontLabel, cursor: 'pointer',
                  border: `1px solid ${editor.cableTypeId === '' ? '#fff' : th.border2}`,
                  background: editor.cableTypeId === '' ? th.border2 : 'transparent',
                  color: editor.cableTypeId === '' ? th.text : th.text3,
                }}
                onClick={() => setEditor(p => ({ ...p, cableTypeId: '' }))}
              >none</button>
              {cableTypes.map(ct => (
                <button
                  key={ct.id}
                  style={{
                    padding: '4px 10px', borderRadius: 999, fontSize: 10,
                    fontFamily: th.fontLabel, cursor: 'pointer',
                    border: `1px solid ${editor.cableTypeId === ct.id ? ct.color : th.border2}`,
                    background: editor.cableTypeId === ct.id ? ct.color : 'transparent',
                    color: editor.cableTypeId === ct.id ? '#0c0d0e' : th.text2,
                  }}
                  onClick={() => setEditor(p => ({ ...p, cableTypeId: ct.id }))}
                >{ct.name}</button>
              ))}
            </div>
          </div>

          {/* External connection toggle */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontFamily: th.fontLabel, fontSize: 10, color: th.text3, marginBottom: 6 }}>
              destination
            </label>
            <div style={{ display: 'flex', gap: 6, marginBottom: editor.isExternal ? 8 : 0 }}>
              <button
                style={{
                  padding: '4px 10px', borderRadius: 999, fontSize: 10,
                  fontFamily: th.fontLabel, cursor: 'pointer',
                  border: `1px solid ${!editor.isExternal ? accent : th.border2}`,
                  background: !editor.isExternal ? accent : 'transparent',
                  color: !editor.isExternal ? '#0c0d0e' : th.text2,
                }}
                onClick={() => setEditor(p => ({ ...p, isExternal: false }))}
              >internal device</button>
              <button
                style={{
                  padding: '4px 10px', borderRadius: 999, fontSize: 10,
                  fontFamily: th.fontLabel, cursor: 'pointer',
                  border: `1px solid ${editor.isExternal ? accent : th.border2}`,
                  background: editor.isExternal ? accent : 'transparent',
                  color: editor.isExternal ? '#0c0d0e' : th.text2,
                }}
                onClick={() => setEditor(p => ({ ...p, isExternal: true }))}
              >external / internet</button>
            </div>
            {editor.isExternal && (
              <input
                style={inputStyle}
                placeholder="e.g. Internet, WAN, ISP"
                value={editor.externalLabel}
                onChange={e => setEditor(p => ({ ...p, externalLabel: e.target.value }))}
              />
            )}
          </div>

          {/* Label */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontFamily: th.fontLabel, fontSize: 10, color: th.text3, marginBottom: 4 }}>
              label (optional)
            </label>
            <input
              style={inputStyle}
              placeholder="e.g. uplink-1, mgmt"
              value={editor.label}
              onChange={e => setEditor(p => ({ ...p, label: e.target.value }))}
            />
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontFamily: th.fontLabel, fontSize: 10, color: th.text3, marginBottom: 4 }}>
              notes (optional)
            </label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: 48 }}
              placeholder="additional notes"
              value={editor.notes}
              onChange={e => setEditor(p => ({ ...p, notes: e.target.value }))}
            />
          </div>

          {error && (
            <div style={{ fontFamily: th.fontLabel, fontSize: 11, color: th.red, marginBottom: 8 }}>{error}</div>
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
            disabled={saving}
            className="act-primary"
            style={{
              padding: '5px 14px', borderRadius: 4,
              background: accent, color: '#0c0d0e',
              border: `1px solid ${accent}`,
              fontFamily: th.fontLabel, fontSize: 11, cursor: 'pointer',
              opacity: saving ? 0.5 : 1,
            }}
            onClick={handleSave}
          >{saving ? 'saving…' : 'create connection'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Occupied Port Warning Popup ──────────────────────────────────────────────
function OccupiedPortPopup({
  block,
  deviceName,
  existingConns,
  devices,
  onRemove,
  onOverride,
  onCancel,
  th,
}: {
  block:         PlacedBlock;
  deviceName:    string;
  existingConns: Connection[];
  devices:       DeviceInstance[];
  onRemove:      (connId: string) => void;
  onOverride:    () => void;
  onCancel:      () => void;
  th:            typeof OS_THEME_TOKENS['homelab-dark'];
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const def = BLOCK_DEF_MAP.get(block.type);
  const label = block.label || def?.label || block.type;
  const deviceId = devices.find(d => d.name === deviceName)?.id;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: th.cardBg, border: `1px solid ${th.border2}`,
          borderRadius: 8, width: 400, maxWidth: '90vw',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          padding: '12px 16px', borderBottom: `1px solid ${th.border}`,
          fontFamily: th.fontMain, fontSize: 13, color: th.text,
        }}>
          port already connected
        </div>

        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontFamily: th.fontData, fontSize: 12, color: th.text, marginBottom: 8 }}>
            <strong>{deviceName}</strong> : {label}
          </div>
          <div style={{ fontFamily: th.fontLabel, fontSize: 11, color: th.text3, marginBottom: 10 }}>
            {existingConns.length} existing connection{existingConns.length !== 1 ? 's' : ''}:
          </div>
          {existingConns.map(c => {
            const otherDeviceId = c.srcBlockId === block.id && c.srcDeviceId === deviceId
              ? c.dstDeviceId : c.srcDeviceId;
            const otherPort = c.srcBlockId === block.id ? c.dstPort : c.srcPort;
            const otherDevice = devices.find(d => d.id === otherDeviceId);
            const isRemoving = removing === c.id;
            return (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 10px', marginBottom: 4, borderRadius: 4,
                background: th.rowBg, border: `1px solid ${th.border}`,
              }}>
                <span style={{ fontFamily: th.fontData, fontSize: 11, color: th.text2 }}>
                  → {otherDevice?.name ?? c.externalLabel ?? 'unknown'}{otherPort ? ` : ${otherPort}` : ''}
                  {c.label ? <span style={{ color: th.text3 }}> ({c.label})</span> : ''}
                </span>
                <button
                  disabled={isRemoving}
                  style={{
                    padding: '2px 8px', borderRadius: 3, flexShrink: 0, marginLeft: 8,
                    border: `1px solid ${th.red}`, background: 'transparent',
                    color: th.red, fontFamily: th.fontLabel, fontSize: 10,
                    cursor: isRemoving ? 'default' : 'pointer',
                    opacity: isRemoving ? 0.5 : 1,
                  }}
                  onClick={() => { setRemoving(c.id); onRemove(c.id); }}
                >{isRemoving ? '…' : 'remove'}</button>
              </div>
            );
          })}
        </div>

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
            onClick={onCancel}
          >cancel</button>
          <button
            style={{
              padding: '5px 14px', borderRadius: 4,
              border: `1px solid ${th.red}`, background: `${th.red}22`,
              color: th.red, fontFamily: th.fontLabel, fontSize: 11, cursor: 'pointer',
            }}
            onClick={onOverride}
          >use anyway</button>
        </div>
      </div>
    </div>
  );
}

// ── Main PatchBoardTab Component ─────────────────────────────────────────────
export function PatchBoardTab({ siteId, accent, connections, onConnectionCreated, onConnectionRemoved }: Props) {
  const osTheme   = useThemeStore(s => s.osTheme);
  const th        = OS_THEME_TOKENS[osTheme];

  const racks      = useRackStore(s => s.racks);
  const devices    = useRackStore(s => s.devices);
  const templates  = useTemplateStore(s => s.deviceTemplates);
  const cableTypes = useTypesStore(s => s.cableTypes);

  // Rack filter — null = all
  const [rackFilter, setRackFilter] = useState<Set<string> | null>(null);

  // Device selection
  const [topDeviceId,    setTopDeviceId]    = useState('');
  const [bottomDeviceId, setBottomDeviceId] = useState('');

  // Panel toggles
  const [topPanel,    setTopPanel]    = useState<'front' | 'rear'>('front');
  const [bottomPanel, setBottomPanel] = useState<'front' | 'rear'>('front');

  // Port selection flow
  const [selectedPort, setSelectedPort] = useState<PortSelection | null>(null);

  // Editor popup
  const [editor, setEditor] = useState<EditorState | null>(null);

  // Occupied port warning
  const [occupiedWarning, setOccupiedWarning] = useState<{
    block: PlacedBlock;
    deviceId: string;
    deviceName: string;
    conns: Connection[];
    tpl: DeviceTemplate;
  } | null>(null);

  // Filter devices: only those with port-bearing templates
  const devicesWithPorts = useMemo(() =>
    devices.filter(d => deviceHasPorts(d, templates)),
    [devices, templates]
  );

  // Rack IDs that have devices with ports
  const rackIdsWithPorts = useMemo(() => {
    const ids = new Set<string>();
    for (const d of devicesWithPorts) {
      if (d.rackId) ids.add(d.rackId);
    }
    return ids;
  }, [devicesWithPorts]);

  const filteredRacks = useMemo(() =>
    racks.filter(r => rackIdsWithPorts.has(r.id)),
    [racks, rackIdsWithPorts]
  );

  // Apply rack filter to device list
  const filteredDevices = useMemo(() => {
    if (rackFilter === null) return devicesWithPorts;
    return devicesWithPorts.filter(d => {
      if (!d.rackId) return rackFilter.has('__unracked');
      return rackFilter.has(d.rackId);
    });
  }, [devicesWithPorts, rackFilter]);

  // Use connections from props + store for live updates
  const allConns = useRackStore(s => s.connections);
  const liveConns = allConns.length > connections.length ? allConns : connections;

  const handlePortClick = useCallback((deviceId: string, block: PlacedBlock, tpl: DeviceTemplate) => {
    const device = devices.find(d => d.id === deviceId);
    if (!device) return;

    const def = BLOCK_DEF_MAP.get(block.type);
    const label = block.label ? `${block.label} (${def?.label ?? block.type})` : (def?.label ?? block.type);
    const portSel: PortSelection = { deviceId, blockId: block.id, blockType: block.type, label: `${device.name} : ${label}` };

    // Check if port is occupied
    const blockConns = findBlockConnections(liveConns, deviceId, block.id);
    if (blockConns.length > 0) {
      setOccupiedWarning({
        block,
        deviceId,
        deviceName: device.name,
        conns: blockConns,
        tpl,
      });
      // Store intent to use this port after override
      setOccupiedWarning(prev => prev ? { ...prev, _pendingPort: portSel } as any : null);
      return;
    }

    applyPortSelection(portSel);
  }, [devices, liveConns, selectedPort]);

  function applyPortSelection(portSel: PortSelection) {
    if (!selectedPort) {
      // First port selected
      setSelectedPort(portSel);
    } else {
      // Second port selected — must be different device
      if (portSel.deviceId === selectedPort.deviceId) {
        // Same device — replace selection
        setSelectedPort(portSel);
        return;
      }
      // Open editor
      const mismatch = hasMismatch(selectedPort.blockType, portSel.blockType);
      setEditor({
        src: selectedPort,
        dst: portSel,
        cableTypeId: '',
        label: '',
        notes: '',
        mismatch,
        overrideOccupied: false,
        isExternal: false,
        externalLabel: '',
      });
      setSelectedPort(null);
    }
  }

  function handleOccupiedOverride() {
    if (!occupiedWarning) return;
    const device = devices.find(d => d.id === occupiedWarning.deviceId);
    if (!device) return;

    const block = occupiedWarning.block;
    const def = BLOCK_DEF_MAP.get(block.type);
    const label = block.label ? `${block.label} (${def?.label ?? block.type})` : (def?.label ?? block.type);
    const portSel: PortSelection = {
      deviceId: occupiedWarning.deviceId,
      blockId: block.id,
      blockType: block.type,
      label: `${device.name} : ${label}`,
    };
    setOccupiedWarning(null);
    applyPortSelection(portSel);
  }

  function handleConnectionSaved(conn: Connection) {
    onConnectionCreated(conn);
    useRackStore.getState().upsertConnection(conn);
  }

  async function handleRemoveConnection(connId: string) {
    try {
      await api.delete(`/api/sites/${siteId}/connections/${connId}`);
      onConnectionRemoved(connId);
      useRackStore.getState().removeConnection(connId);
      // If the removed connection was the last one on this port, close the popup
      setOccupiedWarning(prev => {
        if (!prev) return null;
        const remaining = prev.conns.filter(c => c.id !== connId);
        if (remaining.length === 0) return null;
        return { ...prev, conns: remaining };
      });
    } catch (err) {
      console.error('Failed to remove connection:', err);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .rpill:hover:not(.on) { background: var(--accent-tint, #c47c5a22) !important; border-color: var(--accent, #c47c5a) !important; color: var(--accent, #c47c5a) !important; }
        .rpill.on:hover { background: var(--accent-dark, #a8653e) !important; }
        .pb-port:hover { filter: brightness(1.3) !important; }
      `}</style>

      {/* Rack filter bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 16px', borderBottom: `1px solid ${th.border}`,
      }}>
        <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3, marginRight: 4 }}>
          racks:
        </span>
        <button
          className={`rpill${rackFilter === null ? ' on' : ''}`}
          style={rackFilter === null ? { background: accent, color: '#0c0d0e' } : {}}
          onClick={() => setRackFilter(null)}
        >all</button>
        {filteredRacks.map(r => {
          const isOn = rackFilter !== null && rackFilter.has(r.id);
          return (
            <button
              key={r.id}
              className={`rpill${isOn ? ' on' : ''}`}
              style={isOn ? { background: accent, color: '#0c0d0e' } : {}}
              onClick={() => {
                setRackFilter(prev => {
                  if (prev === null) return new Set([r.id]);
                  const next = new Set(prev);
                  if (next.has(r.id)) {
                    next.delete(r.id);
                    return next.size === 0 ? null : next;
                  }
                  next.add(r.id);
                  return next;
                });
              }}
            >{r.name}</button>
          );
        })}

        {/* Unracked devices indicator */}
        {devicesWithPorts.some(d => !d.rackId) && (
          <button
            className={`rpill${rackFilter !== null && rackFilter.has('__unracked') ? ' on' : ''}`}
            style={rackFilter !== null && rackFilter.has('__unracked') ? { background: accent, color: '#0c0d0e' } : {}}
            onClick={() => {
              setRackFilter(prev => {
                if (prev === null) return new Set(['__unracked']);
                const next = new Set(prev);
                if (next.has('__unracked')) {
                  next.delete('__unracked');
                  return next.size === 0 ? null : next;
                }
                next.add('__unracked');
                return next;
              });
            }}
          >unracked</button>
        )}

        <div style={{ flex: 1 }} />

        {/* Selection indicator */}
        {selectedPort && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontFamily: th.fontLabel, fontSize: 10,
          }}>
            <span style={{ color: accent }}>{selectedPort.label}</span>
            <span style={{ color: th.text3 }}>→ select destination port</span>
            <button
              style={{ color: th.text3, fontFamily: th.fontLabel, fontSize: 10, cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => setSelectedPort(null)}
            >clear</button>
          </div>
        )}
      </div>

      {/* Top device strip */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <DeviceStrip
          position="top"
          deviceId={topDeviceId}
          onDeviceChange={setTopDeviceId}
          panel={topPanel}
          onPanelChange={setTopPanel}
          filteredDevices={filteredDevices}
          templates={templates}
          connections={liveConns}
          cableTypes={cableTypes}
          accent={accent}
          selectedPort={selectedPort}
          onPortClick={handlePortClick}
          th={th}
        />

        {/* Divider */}
        <div style={{
          padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ flex: 1, height: 1, background: th.border2 }} />
          <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3 }}>
            click a port above, then a port below to patch
          </span>
          <div style={{ flex: 1, height: 1, background: th.border2 }} />
        </div>

        {/* Bottom device strip */}
        <DeviceStrip
          position="bottom"
          deviceId={bottomDeviceId}
          onDeviceChange={setBottomDeviceId}
          panel={bottomPanel}
          onPanelChange={setBottomPanel}
          filteredDevices={filteredDevices}
          templates={templates}
          connections={liveConns}
          cableTypes={cableTypes}
          accent={accent}
          selectedPort={selectedPort}
          onPortClick={handlePortClick}
          th={th}
        />
      </div>

      {/* Connection editor popup */}
      {editor && (
        <ConnectionEditor
          editor={editor}
          setEditor={fn => setEditor(prev => prev ? fn(prev) : null)}
          siteId={siteId}
          accent={accent}
          onSave={handleConnectionSaved}
          onClose={() => { setEditor(null); setSelectedPort(null); }}
          th={th}
          cableTypes={cableTypes}
        />
      )}

      {/* Occupied port warning */}
      {occupiedWarning && (
        <OccupiedPortPopup
          block={occupiedWarning.block}
          deviceName={occupiedWarning.deviceName}
          existingConns={occupiedWarning.conns}
          devices={devices}
          onRemove={handleRemoveConnection}
          onOverride={handleOccupiedOverride}
          onCancel={() => setOccupiedWarning(null)}
          th={th}
        />
      )}
    </div>
  );
}
