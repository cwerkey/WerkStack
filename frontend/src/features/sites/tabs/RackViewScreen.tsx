import { useState, useMemo, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Icon } from '../../../components/ui/Icon';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorBoundary } from '../../../components/ui/ErrorBoundary';
import { TemplateOverlay } from '../../../components/ui/TemplateOverlay';
import { useRackStore } from '../../../store/useRackStore';
import { useTemplateStore } from '../../../store/useTemplateStore';
import { useTypesStore } from '../../../store/useTypesStore';
import { api } from '../../../utils/api';
import { getDeviceDisplayInfo } from './rack_view/DeviceOverlay';
import { DeviceEditorModal } from './rack_view/DeviceEditorModal';
import { buildVirtualFaceplate } from './rack_view/portAggregator';
import { DeployWizard } from './device_lib/DeployWizard';
import { ShelfDetailModal } from './rack_view/ShelfDetailModal';
import { BLOCK_DEF_MAP } from '@werkstack/shared';
import type { SiteCtx } from '../../SiteShell';
import type { DeviceInstance } from '@werkstack/shared';

const RACK_U_HEIGHT = 40; // px per U position
const RACK_WIDTH = 480;   // px width for rack rendering
const U_LABEL_WIDTH = 32; // px width for U number labels

type Face = 'front' | 'rear';
type MapOverlay = 'none' | 'network' | 'power' | 'bays';

export function RackViewScreen() {
  const { site, accent, css } = useOutletContext<SiteCtx>();
  const av = { '--accent': accent } as React.CSSProperties;

  const racks           = useRackStore(s => s.racks);
  const devices         = useRackStore(s => s.devices);
  const deviceTemplates = useTemplateStore(s => s.deviceTemplates);
  const pcieTemplates   = useTemplateStore(s => s.pcieTemplates);
  const deviceTypes     = useTypesStore(s => s.deviceTypes);

  // UI state
  const [selectedRackId, setSelectedRackId] = useState<string | null>(null);
  const [face, setFace]                     = useState<Face>('front');
  const [mapOverlay, setMapOverlay]         = useState<MapOverlay>('none');
  const [showDeviceRear, setShowDeviceRear] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DeviceInstance | null>(null);
  const [paneMode, setPaneMode]             = useState<'info' | 'inventory'>('inventory');

  // Drag state
  const [dragDevice, setDragDevice]   = useState<DeviceInstance | null>(null);
  const [dragGhostU, setDragGhostU]   = useState<number | null>(null);
  const rackBodyRef = useRef<HTMLDivElement>(null);

  // Right-click context menu state
  const [rackCtx, setRackCtx] = useState<{ x: number; y: number; u: number } | null>(null);

  // Deploy wizard state
  const [deployOpen, setDeployOpen] = useState(false);
  const [deployPreU, setDeployPreU] = useState<number | undefined>();

  // Shelf detail modal state
  const [shelfDetailDevice, setShelfDetailDevice] = useState<DeviceInstance | null>(null);

  // Auto-select first rack
  const activeRack = racks.find(r => r.id === selectedRackId) ?? racks[0] ?? null;
  const activeRackId = activeRack?.id ?? null;

  // Devices in this rack
  const rackDevices = useMemo(() =>
    devices.filter(d => d.rackId === activeRackId),
  [devices, activeRackId]);

  // Devices on active face
  const faceDevices = useMemo(() =>
    rackDevices.filter(d => d.face === face && d.rackU != null),
  [rackDevices, face]);

  // Ghost devices (opposite face, shown at 35% opacity)
  const ghostDevices = useMemo(() =>
    rackDevices.filter(d => d.face !== face && d.rackU != null),
  [rackDevices, face]);

  // Unracked devices (in site but not in any rack)
  const unrackedDevices = useMemo(() =>
    devices.filter(d => !d.rackId),
  [devices]);

  // Devices on shelves in this rack
  const shelfChildren = useMemo(() => {
    const map = new Map<string, DeviceInstance[]>();
    for (const d of devices) {
      if (d.shelfDeviceId) {
        if (!map.has(d.shelfDeviceId)) map.set(d.shelfDeviceId, []);
        map.get(d.shelfDeviceId)!.push(d);
      }
    }
    return map;
  }, [devices]);

  // U positions for the rack (bottom-up numbering: U1 at bottom)
  const uPositions = useMemo(() => {
    if (!activeRack) return [];
    const arr: number[] = [];
    for (let u = activeRack.uHeight; u >= 1; u--) arr.push(u);
    return arr;
  }, [activeRack?.uHeight]);

  // Filter blocks by MAP overlay
  const filterBlocks = useCallback((blocks: import('@werkstack/shared').PlacedBlock[]) => {
    if (mapOverlay === 'none') return blocks;
    return blocks.filter(b => {
      const def = BLOCK_DEF_MAP.get(b.type);
      if (!def) return false;
      if (mapOverlay === 'network') return def.isNet;
      if (mapOverlay === 'power') return b.type === 'power';
      if (mapOverlay === 'bays') return def.isSlot;
      return true;
    });
  }, [mapOverlay]);

  // Export / print rack view
  function handleExportPrint() {
    if (!activeRack) return;
    const rackBodyEl = rackBodyRef.current;
    const rackHtml = rackBodyEl ? rackBodyEl.outerHTML : '<p>No rack data</p>';
    const rackName = activeRack.name;
    const siteName = site?.name ?? 'Site';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Rack View — ${rackName} (${siteName})</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'JetBrains Mono', 'Courier New', monospace;
      font-size: 11px;
      background: #0c0d0e;
      color: #d4d9dd;
      margin: 24px;
    }
    h1 { font-size: 16px; margin-bottom: 4px; }
    .meta { font-size: 10px; color: #666; margin-bottom: 16px; }
    .rack-print-wrap {
      display: inline-block;
      border: 1px solid #262c30;
      border-radius: 6px;
      padding: 8px;
      background: #141618;
    }
    /* Preserve essential rack styles */
    [data-rack-body] { position: relative; }
    @media print {
      body { background: #fff; color: #000; margin: 12px; }
      .rack-print-wrap { border-color: #ccc; background: #fafafa; }
    }
  </style>
</head>
<body>
  <h1>${rackName}</h1>
  <div class="meta">
    Site: ${siteName} &nbsp;|&nbsp;
    Face: ${face} &nbsp;|&nbsp;
    Height: ${activeRack.uHeight}U &nbsp;|&nbsp;
    Exported: ${new Date().toLocaleString()}
  </div>
  <div class="rack-print-wrap">${rackHtml}</div>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  // Drag handlers
  function handleDragStart(device: DeviceInstance) {
    setDragDevice(device);
  }

  function handleDragOver(e: React.DragEvent, uPos: number) {
    e.preventDefault();
    setDragGhostU(uPos);
  }

  function handleDrop(e: React.DragEvent, targetU: number) {
    e.preventDefault();
    if (!dragDevice || !activeRackId || !site) return;

    // Collision check
    const uHeight = dragDevice.uHeight ?? 1;
    const hasCollision = faceDevices.some(d => {
      if (d.id === dragDevice.id) return false;
      if (!d.rackU || !d.uHeight) return false;
      const dTop = d.rackU;
      const dBottom = d.rackU + d.uHeight - 1;
      return targetU <= dBottom && (targetU + uHeight - 1) >= dTop;
    });

    if (hasCollision) {
      setDragDevice(null);
      setDragGhostU(null);
      return;
    }

    // POST position update
    api.patch<DeviceInstance>(
      `/api/sites/${site.id}/devices/${dragDevice.id}/position`,
      { rackId: activeRackId, rackU: targetU, face }
    ).then(updated => {
      if (updated) useRackStore.getState().upsertDevice(updated);
    }).catch(err => {
      console.error('[drop position]', err);
    });

    setDragDevice(null);
    setDragGhostU(null);
  }

  function handleDeviceClick(device: DeviceInstance) {
    // Only racked devices open the editor pane
    if (device.rackId) {
      setSelectedDevice(device);
      setPaneMode('info');
    }
  }

  // Check if a U position is occupied by any device on the current face
  function isUEmpty(u: number): boolean {
    return !faceDevices.some(d => {
      if (!d.rackU || !d.uHeight) return false;
      return u >= d.rackU && u < d.rackU + d.uHeight;
    });
  }

  // Right-click on empty rack row
  function handleRowContextMenu(e: React.MouseEvent, u: number) {
    if (!isUEmpty(u)) return; // only empty rows
    e.preventDefault();
    setRackCtx({ x: e.clientX, y: e.clientY, u });
  }

  // Rack-mountable unracked devices for context menu
  const rackMountableUnracked = useMemo(() =>
    unrackedDevices.filter(d => {
      const tmpl = d.templateId ? deviceTemplates.find(t => t.id === d.templateId) : null;
      return tmpl?.formFactor === 'rack' || (!tmpl && d.uHeight && d.uHeight > 0);
    }),
  [unrackedDevices, deviceTemplates]);

  // Create a shelf at the right-clicked U position
  function handleAddShelf(uHeight: number) {
    if (!activeRackId || !site || !rackCtx) return;
    api.post<DeviceInstance>(
      `/api/sites/${site.id}/devices`,
      {
        typeId: 'dt-shelf',
        name: `Shelf ${uHeight}U`,
        rackId: activeRackId,
        rackU: rackCtx.u,
        uHeight,
        face,
        isDraft: false,
      }
    ).then(device => {
      useRackStore.getState().upsertDevice(device);
    }).catch(err => {
      console.error('[add shelf]', err);
    });
    setRackCtx(null);
  }

  // Place an unracked device at the right-clicked U position
  function handlePlaceFromContext(device: DeviceInstance) {
    if (!activeRackId || !site || !rackCtx) return;
    api.patch<DeviceInstance>(
      `/api/sites/${site.id}/devices/${device.id}/position`,
      { rackId: activeRackId, rackU: rackCtx.u, face }
    ).then(updated => {
      if (updated) useRackStore.getState().upsertDevice(updated);
    }).catch(err => {
      console.error('[context place]', err);
    });
    setRackCtx(null);
  }

  // Render a device at its U position
  function renderDevice(device: DeviceInstance, isGhost: boolean) {
    if (!device.rackU || !device.uHeight || !activeRack) return null;

    const template = device.templateId
      ? deviceTemplates.find(t => t.id === device.templateId)
      : undefined;

    const topOffset = (activeRack.uHeight - device.rackU - device.uHeight + 1) * RACK_U_HEIGHT;
    const height = device.uHeight * RACK_U_HEIGHT;
    const isShelf = device.typeId === 'dt-shelf';

    // Determine which face's blocks to show
    const showFace = showDeviceRear && device.face === 'front' && face === 'front'
      ? 'rear' : (isGhost ? (face === 'front' ? 'rear' : 'front') : face);

    // Shelf rendering
    if (isShelf) {
      const children = shelfChildren.get(device.id) ?? [];
      const shelfGridCols = 96;
      const shelfGridRows = device.uHeight * 12;
      const cellW = RACK_WIDTH / shelfGridCols;
      const cellH = height / shelfGridRows;

      return (
        <div
          key={device.id}
          style={{
            position: 'absolute',
            top: topOffset,
            left: 0,
            right: 0,
            height,
            opacity: isGhost ? 0.35 : 1,
            cursor: isGhost ? 'default' : 'pointer',
            zIndex: isGhost ? 1 : 2,
            pointerEvents: isGhost ? 'none' : 'auto',
          }}
          onClick={isGhost ? undefined : () => handleDeviceClick(device)}
          onDoubleClick={isGhost ? undefined : () => setShelfDetailDevice(device)}
          draggable={!isGhost}
          onDragStart={!isGhost ? () => handleDragStart(device) : undefined}
        >
          <div style={{
            width: RACK_WIDTH,
            height: height - 2,
            background: '#8a929910',
            border: '1px solid #8a929933',
            borderRadius: 4,
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Shelf label */}
            <div style={{
              position: 'absolute', top: 2, left: 6,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 8, color: '#8a929966',
              userSelect: 'none', zIndex: 1,
            }}>
              {device.name}
            </div>

            {/* Shelf children devices */}
            {children.map(child => {
              if (child.shelfCol == null || child.shelfRow == null) return null;
              const childTemplate = child.templateId
                ? deviceTemplates.find(t => t.id === child.templateId)
                : undefined;
              const childCols = childTemplate?.gridCols ?? 10;
              const childRows = childTemplate?.gridRows ?? 10;
              const childDt = deviceTypes.find(t => t.id === child.typeId);
              return (
                <div
                  key={child.id}
                  style={{
                    position: 'absolute',
                    left: child.shelfCol * cellW,
                    top: child.shelfRow * cellH,
                    width: childCols * cellW,
                    height: childRows * cellH,
                    background: (childDt?.color ?? '#666') + '22',
                    border: `1px solid ${(childDt?.color ?? '#666')}55`,
                    borderRadius: 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                    zIndex: 2,
                  }}
                  onClick={e => { e.stopPropagation(); handleDeviceClick(child); }}
                >
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 7, color: childDt?.color ?? '#666',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    padding: '0 2px',
                  }}>
                    {child.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div
        key={device.id}
        style={{
          position: 'absolute',
          top: topOffset,
          left: 0,
          right: 0,
          height,
          opacity: isGhost ? 0.35 : 1,
          cursor: isGhost ? 'default' : 'pointer',
          zIndex: isGhost ? 1 : 2,
          pointerEvents: isGhost ? 'none' : 'auto',
        }}
        onClick={isGhost ? undefined : () => handleDeviceClick(device)}
        draggable={!isGhost}
        onDragStart={!isGhost ? () => handleDragStart(device) : undefined}
      >
        {template ? (
          <ErrorBoundary>
            <TemplateOverlay
              blocks={filterBlocks(
                buildVirtualFaceplate(template, showFace, [], pcieTemplates)
              )}
              gridCols={template.formFactor === 'rack' ? 96 : (template.gridCols ?? 96)}
              gridRows={template.formFactor === 'rack' ? template.uHeight * 12 : (template.gridRows ?? 12)}
              width={RACK_WIDTH}
              height={height}
              showLabels={mapOverlay === 'none'}
            />
          </ErrorBoundary>
        ) : (
          // DeviceOverlay fallback — simple colored block
          (() => {
            const info = getDeviceDisplayInfo(device, deviceTypes);
            return (
              <div style={{
                width: RACK_WIDTH,
                height: height - 2,
                background: info.color + '18',
                border: `1px solid ${info.color}55`,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}>
                <Icon name="server" size={14} color={info.color} />
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11, fontWeight: 600,
                  color: info.color,
                }}>
                  {info.name}
                </span>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9, color: 'var(--text3, #4e5560)',
                }}>
                  {info.uHeight}U
                </span>
              </div>
            );
          })()
        )}
      </div>
    );
  }

  // No racks at all
  if (racks.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, ...av, ...css.vars } as React.CSSProperties}>
        <EmptyState
          icon="rack"
          title="no racks configured"
          subtitle="Go to Rack Setup to add racks for this site."
        />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, ...av, ...css.vars } as React.CSSProperties}>
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .rpill:hover:not(.on) { background: var(--accent-tint, #c47c5a22) !important; border-color: var(--accent, #c47c5a) !important; color: var(--accent, #c47c5a) !important; }
        .rpill.on:hover { background: var(--accent-dark, #a8653e) !important; }
        .tpill:hover { filter: brightness(1.2); }
        .tab-wrap:hover .tab-btn-inner { color: var(--accent, #c47c5a) !important; }
        .rv-u-row:hover { background: var(--cardBg, #141618) !important; }
        .rv-unracked-item:hover { border-color: var(--border3, #2e3538) !important; }
      `}</style>

      {/* ── Toolbar ────────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px',
        borderBottom: '1px solid var(--border, #1d2022)',
        flexShrink: 0, flexWrap: 'wrap', gap: 8,
      }}>
        {/* Left: rack selector pills */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="filter-label">rack</span>
          <div className="filter-div" />
          {racks.map(r => (
            <button
              key={r.id}
              className={`rpill${activeRackId === r.id ? ' on' : ''}`}
              onClick={() => setSelectedRackId(r.id)}
            >
              {r.name}
            </button>
          ))}
        </div>

        {/* Right: controls */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Face toggle */}
          <div className="view-toggle">
            <button className={`view-toggle-btn${face === 'front' ? ' on' : ''}`} onClick={() => setFace('front')}>Front</button>
            <button className={`view-toggle-btn${face === 'rear' ? ' on' : ''}`} onClick={() => setFace('rear')}>Rear</button>
          </div>

          {/* MAP overlay pills */}
          <div className="filter-div" />
          <span className="filter-label">map</span>
          {(['none', 'network', 'power', 'bays'] as MapOverlay[]).map(m => (
            <button
              key={m}
              className={`rpill${mapOverlay === m ? ' on' : ''}`}
              onClick={() => setMapOverlay(m)}
            >
              {m === 'none' ? 'all' : m}
            </button>
          ))}

          {/* Export button */}
          <div className="filter-div" />
          <button
            className="btn-ghost"
            onClick={handleExportPrint}
            style={{ fontSize: 10, padding: '3px 10px', borderRadius: 4 }}
          >
            export / print
          </button>

          {/* Device rear toggle */}
          {face === 'front' && (
            <>
              <div className="filter-div" />
              <label className="ote-check" onClick={() => setShowDeviceRear(!showDeviceRear)}>
                <span style={{
                  width: 14, height: 14, borderRadius: 3,
                  border: `1px solid ${showDeviceRear ? accent : 'var(--border2, #262c30)'}`,
                  background: showDeviceRear ? accent : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {showDeviceRear && <Icon name="check" size={10} color="#0c0d0e" />}
                </span>
                device rear
              </label>
            </>
          )}
        </div>
      </div>

      {/* ── Main content: rack + sidebar ───────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* ── Rack column ──────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', justifyContent: 'center' }}>
          {activeRack && (
            <div style={{ display: 'flex', gap: 0 }}>
              {/* U labels */}
              <div style={{ width: U_LABEL_WIDTH, flexShrink: 0, paddingTop: 0 }}>
                {uPositions.map(u => (
                  <div key={u} style={{
                    height: RACK_U_HEIGHT,
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                    paddingRight: 6,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9, color: 'var(--text3, #4e5560)',
                    userSelect: 'none',
                  }}>
                    {u}
                  </div>
                ))}
              </div>

              {/* Rack body */}
              <div
                ref={rackBodyRef}
                style={{
                  width: RACK_WIDTH,
                  height: (activeRack.uHeight) * RACK_U_HEIGHT,
                  position: 'relative',
                  background: 'var(--cardBg, #141618)',
                  border: '1px solid var(--border2, #262c30)',
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
              >
                {/* U grid lines */}
                {uPositions.map(u => (
                  <div
                    key={u}
                    className="rv-u-row"
                    style={{
                      position: 'absolute',
                      top: (activeRack.uHeight - u) * RACK_U_HEIGHT,
                      left: 0, right: 0,
                      height: RACK_U_HEIGHT,
                      borderBottom: '1px solid var(--border, #1d2022)',
                      transition: 'background 0.1s',
                    }}
                    onDragOver={(e) => handleDragOver(e, u)}
                    onDrop={(e) => handleDrop(e, u)}
                    onContextMenu={(e) => handleRowContextMenu(e, u)}
                  >
                    {/* Drop ghost indicator */}
                    {dragGhostU === u && dragDevice && (
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: accent + '22',
                        border: `1px dashed ${accent}`,
                        borderRadius: 3,
                        pointerEvents: 'none',
                        height: (dragDevice.uHeight ?? 1) * RACK_U_HEIGHT,
                      }} />
                    )}
                  </div>
                ))}

                {/* Ghost devices (opposite face) */}
                {ghostDevices.map(d => renderDevice(d, true))}

                {/* Active face devices */}
                {faceDevices.map(d => renderDevice(d, false))}
              </div>

              {/* Right U labels */}
              <div style={{ width: U_LABEL_WIDTH, flexShrink: 0, paddingTop: 0 }}>
                {uPositions.map(u => (
                  <div key={u} style={{
                    height: RACK_U_HEIGHT,
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                    paddingLeft: 6,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 9, color: 'var(--text3, #4e5560)',
                    userSelect: 'none',
                  }}>
                    {u}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right pane: Info (device editor) / Inventory (unracked) ────────── */}
        <div style={{
          width: 'min(450px, 35vw)', flexShrink: 0,
          borderLeft: '1px solid var(--border, #1d2022)',
          display: 'flex', flexDirection: 'column',
          minHeight: 0,
        }}>
          {/* Pane body */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {paneMode === 'info' ? (
              selectedDevice ? (
                <DeviceEditorModal
                  open={true}
                  onClose={() => { setSelectedDevice(null); setPaneMode('inventory'); }}
                  device={selectedDevice}
                  siteId={site?.id ?? ''}
                  accent={accent}
                  renderAsPane
                />
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: '100%', padding: 20,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11, color: 'var(--text3, #4e5560)',
                  textAlign: 'center',
                }}>
                  select a device to edit
                </div>
              )
            ) : (
              <div style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, fontWeight: 700,
                  color: 'var(--text2, #8a9299)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 4,
                }}>
                  unracked ({unrackedDevices.length})
                </div>

                {unrackedDevices.length === 0 ? (
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10, color: 'var(--text3, #4e5560)',
                    padding: '8px 0',
                  }}>
                    all devices are racked
                  </div>
                ) : (
                  unrackedDevices.map(d => {
                    const info = getDeviceDisplayInfo(d, deviceTypes);
                    return (
                      <div
                        key={d.id}
                        className="rv-unracked-item"
                        draggable
                        onDragStart={() => handleDragStart(d)}
                        style={{
                          background: 'var(--cardBg, #141618)',
                          border: '1px solid var(--border2, #262c30)',
                          borderRadius: 6, padding: '8px 10px',
                          cursor: 'grab',
                          transition: 'border-color 0.15s',
                        }}
                      >
                        <div style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 11, fontWeight: 600,
                          color: 'var(--text, #d4d9dd)',
                          marginBottom: 2,
                        }}>
                          {d.name}
                        </div>
                        <div style={{
                          display: 'flex', gap: 6, alignItems: 'center',
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 9, color: 'var(--text3, #4e5560)',
                        }}>
                          <span className="badge" style={{
                            background: info.color + '22', color: info.color,
                            fontSize: 9, padding: '1px 5px',
                          }}>
                            {deviceTypes.find(t => t.id === d.typeId)?.name ?? d.typeId}
                          </span>
                          {d.uHeight && <span>{d.uHeight}U</span>}
                          {d.isDraft && <span style={{ color: 'var(--gold, #b89870)' }}>draft</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Bottom toggle */}
          <div style={{
            borderTop: '1px solid var(--border, #1d2022)',
            padding: '6px 10px',
            display: 'flex', gap: 0,
            flexShrink: 0,
          }}>
            <div className="view-toggle" style={{ width: '100%' }}>
              <button
                className={`view-toggle-btn${paneMode === 'info' ? ' on' : ''}`}
                onClick={() => setPaneMode('info')}
                style={{ flex: 1 }}
              >
                Info
              </button>
              <button
                className={`view-toggle-btn${paneMode === 'inventory' ? ' on' : ''}`}
                onClick={() => setPaneMode('inventory')}
                style={{ flex: 1 }}
              >
                Inventory
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right-click context menu on empty rack rows ─────────────────────── */}
      {rackCtx && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1800 }}
            onClick={() => setRackCtx(null)}
            onContextMenu={e => { e.preventDefault(); setRackCtx(null); }}
          />
          <div style={{
            position: 'fixed',
            left: rackCtx.x, top: rackCtx.y,
            zIndex: 1801,
            background: 'var(--cardBg, #141618)',
            border: '1px solid var(--border2, #262c30)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            minWidth: 200, maxWidth: 280,
            padding: '6px 0',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            <div style={{
              padding: '4px 12px 6px',
              fontSize: 9, fontWeight: 700,
              color: 'var(--text3, #4e5560)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              U{rackCtx.u} · {face}
            </div>

            {rackMountableUnracked.length > 0 ? (
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {rackMountableUnracked.map(d => {
                  const info = getDeviceDisplayInfo(d, deviceTypes);
                  return (
                    <button
                      key={d.id}
                      onClick={() => handlePlaceFromContext(d)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        width: '100%', padding: '6px 12px',
                        background: 'transparent', border: 'none',
                        cursor: 'pointer', textAlign: 'left',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 11, color: 'var(--text, #d4d9dd)',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--border, #1d2022)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span className="badge" style={{
                        background: info.color + '22', color: info.color,
                        fontSize: 9, padding: '1px 5px',
                      }}>
                        {d.uHeight ?? '?'}U
                      </span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{
                padding: '6px 12px', fontSize: 10,
                color: 'var(--text3, #4e5560)',
              }}>
                no unracked devices
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border, #1d2022)', margin: '4px 0' }} />
            <button
              onClick={() => {
                setDeployPreU(rackCtx.u);
                setRackCtx(null);
                setDeployOpen(true);
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: '100%', padding: '6px 12px',
                background: 'transparent', border: 'none',
                cursor: 'pointer', textAlign: 'left',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, color: accent,
                fontWeight: 600,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--border, #1d2022)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <Icon name="plus" size={10} color={accent} />
              Deploy New
            </button>

            <div style={{ borderTop: '1px solid var(--border, #1d2022)', margin: '4px 0' }} />
            <div style={{
              padding: '4px 12px 2px',
              fontSize: 9, fontWeight: 700,
              color: 'var(--text3, #4e5560)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              Add Shelf
            </div>
            {[1, 2, 3, 4, 5, 6].map(u => (
              <button
                key={u}
                onClick={() => handleAddShelf(u)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  width: '100%', padding: '4px 12px',
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, color: 'var(--text, #d4d9dd)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--border, #1d2022)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {u}U Shelf
              </button>
            ))}
          </div>
        </>
      )}

      {/* Deploy wizard */}
      <DeployWizard
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
        siteId={site?.id ?? ''}
        accent={accent}
        preRackId={activeRackId ?? undefined}
        preRackU={deployPreU}
        preFace={face}
      />

      {/* Shelf detail modal */}
      {shelfDetailDevice && (
        <ShelfDetailModal
          shelf={shelfDetailDevice}
          siteId={site?.id ?? ''}
          accent={accent}
          onClose={() => setShelfDetailDevice(null)}
          onEditDevice={(device) => {
            setShelfDetailDevice(null);
            setSelectedDevice(device);
            setPaneMode('info');
          }}
        />
      )}
    </div>
  );
}
