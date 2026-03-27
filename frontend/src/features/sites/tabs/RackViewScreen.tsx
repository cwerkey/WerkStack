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
  const [editorOpen, setEditorOpen]         = useState(false);

  // Drag state
  const [dragDevice, setDragDevice]   = useState<DeviceInstance | null>(null);
  const [dragGhostU, setDragGhostU]   = useState<number | null>(null);
  const rackBodyRef = useRef<HTMLDivElement>(null);

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
    setSelectedDevice(device);
    setEditorOpen(true);
  }

  // Render a device at its U position
  function renderDevice(device: DeviceInstance, isGhost: boolean) {
    if (!device.rackU || !device.uHeight || !activeRack) return null;

    const template = device.templateId
      ? deviceTemplates.find(t => t.id === device.templateId)
      : undefined;

    const topOffset = (activeRack.uHeight - device.rackU - device.uHeight + 1) * RACK_U_HEIGHT;
    const height = device.uHeight * RACK_U_HEIGHT;

    // Determine which face's blocks to show
    const showFace = showDeviceRear && device.face === 'front' && face === 'front'
      ? 'rear' : (isGhost ? (face === 'front' ? 'rear' : 'front') : face);

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

        {/* ── Right sidebar: unracked devices ──────────────────────────────────── */}
        <div style={{
          width: 220, flexShrink: 0,
          borderLeft: '1px solid var(--border, #1d2022)',
          overflowY: 'auto',
          padding: '12px 10px',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
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
                  onClick={() => handleDeviceClick(d)}
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
      </div>

      {/* Device Editor Modal */}
      <DeviceEditorModal
        open={editorOpen}
        onClose={() => { setEditorOpen(false); setSelectedDevice(null); }}
        device={selectedDevice}
        siteId={site?.id ?? ''}
        accent={accent}
      />
    </div>
  );
}
