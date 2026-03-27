import { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext }    from 'react-router-dom';
import { useRackStore }        from '../../../store/useRackStore';
import { useTypesStore }       from '../../../store/useTypesStore';
import { useThemeStore, OS_THEME_TOKENS, themeToVars } from '../../../store/useThemeStore';
import { api }                 from '../../../utils/api';
import { EmptyState }          from '../../../components/ui/EmptyState';
import type { SiteCtx }        from '../../SiteShell';
import type { Connection, DeviceType, CableType } from '@werkstack/shared';
import { PathfinderPanel } from './pathfinder/PathfinderPanel';

// ── Layout ────────────────────────────────────────────────────────────────────
const NODE_W = 120;
const NODE_H = 32;
const PAD    = 60;

interface NodePos { x: number; y: number; }

function circleLayout(n: number, cx: number, cy: number, r: number): NodePos[] {
  if (n === 0) return [];
  if (n === 1) return [{ x: cx - NODE_W / 2, y: cy - NODE_H / 2 }];
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return {
      x: cx + r * Math.cos(angle) - NODE_W / 2,
      y: cy + r * Math.sin(angle) - NODE_H / 2,
    };
  });
}

// ── Edge helper ───────────────────────────────────────────────────────────────
function edgeMidpoint(pos: NodePos): { cx: number; cy: number } {
  return { cx: pos.x + NODE_W / 2, cy: pos.y + NODE_H / 2 };
}

// ── Component ─────────────────────────────────────────────────────────────────
export function TopologyScreen() {
  const { site, accent, css } = useOutletContext<SiteCtx>();
  const av = { '--accent': accent } as React.CSSProperties;

  const osTheme = useThemeStore(s => s.osTheme);
  const th      = OS_THEME_TOKENS[osTheme];
  const thVars  = themeToVars(th) as React.CSSProperties;

  const devices     = useRackStore(s => s.devices);
  const deviceTypes = useTypesStore(s => s.deviceTypes);
  const cableTypes  = useTypesStore(s => s.cableTypes);

  const [conns,   setConns]   = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  // View state
  const [zoom,     setZoom]     = useState(1);
  const [pan,      setPan]      = useState<NodePos>({ x: 0, y: 0 });
  const [positions, setPositions] = useState<Record<string, NodePos>>({});
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [showPathfinder, setShowPathfinder] = useState(false);

  // Drag state (for node drag)
  const dragRef = useRef<{
    nodeId: string;
    startMouse: NodePos;
    startPos: NodePos;
  } | null>(null);

  // Pan state (for background drag)
  const panRef = useRef<{
    startMouse: NodePos;
    startPan: NodePos;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  const siteId  = site?.id ?? '';
  const apiBase = `/api/sites/${siteId}`;

  useEffect(() => {
    if (!site) return;
    setLoading(true);
    api.get<Connection[]>(`${apiBase}/connections`)
      .then(data => setConns(data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [site?.id]);

  // Initialize positions when devices or connections change
  useEffect(() => {
    if (devices.length === 0) return;
    const visibleDevices = connectedOnly
      ? devices.filter(d => conns.some(c => c.srcDeviceId === d.id || c.dstDeviceId === d.id))
      : devices;
    if (visibleDevices.length === 0) return;

    const W   = svgRef.current?.clientWidth  ?? 800;
    const H   = svgRef.current?.clientHeight ?? 500;
    const cx  = W / 2;
    const cy  = H / 2;
    const r   = Math.min(W, H) / 2 - PAD;
    const pts = circleLayout(visibleDevices.length, cx, cy, Math.max(r, 80));

    const newPos: Record<string, NodePos> = {};
    visibleDevices.forEach((d, i) => {
      newPos[d.id] = positions[d.id] ?? pts[i];
    });
    setPositions(newPos);
  }, [devices.length, conns.length, connectedOnly]);

  // ── Drag handlers (node) ───────────────────────────────────────────────────
  const onNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    dragRef.current = {
      nodeId,
      startMouse: { x: e.clientX, y: e.clientY },
      startPos:   positions[nodeId] ?? { x: 0, y: 0 },
    };
  }, [positions]);

  const onSvgMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) {
      const { nodeId, startMouse, startPos } = dragRef.current;
      const dx = (e.clientX - startMouse.x) / zoom;
      const dy = (e.clientY - startMouse.y) / zoom;
      setPositions(p => ({ ...p, [nodeId]: { x: startPos.x + dx, y: startPos.y + dy } }));
      return;
    }
    if (panRef.current) {
      const { startMouse, startPan } = panRef.current;
      setPan({
        x: startPan.x + (e.clientX - startMouse.x),
        y: startPan.y + (e.clientY - startMouse.y),
      });
    }
  }, [zoom]);

  const onSvgMouseUp = useCallback(() => {
    dragRef.current = null;
    panRef.current  = null;
  }, []);

  const onBgMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target !== svgRef.current && (e.target as Element).tagName === 'svg') return;
    panRef.current = {
      startMouse: { x: e.clientX, y: e.clientY },
      startPan:   pan,
    };
  }, [pan]);

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const deviceTypeMap = new Map<string, DeviceType>(deviceTypes.map(t => [t.id, t]));
  const cableTypeMap  = new Map<string, CableType>(cableTypes.map(c => [c.id, c]));

  const visibleDevices = connectedOnly
    ? devices.filter(d => conns.some(c => c.srcDeviceId === d.id || c.dstDeviceId === d.id))
    : devices;

  const visibleConns = conns.filter(c =>
    positions[c.srcDeviceId] && positions[c.dstDeviceId]
  );

  // Unique device types in view for legend
  const legendTypes = Array.from(
    new Map(
      visibleDevices
        .map(d => deviceTypeMap.get(d.typeId))
        .filter(Boolean)
        .map(t => [t!.id, t!])
    ).values()
  );

  if (loading) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
        ...av, ...(css.vars as React.CSSProperties), ...thVars,
        background: th.pageBg, color: th.text,
      }}>
        <div style={{ padding: 32, fontFamily: th.fontData, fontSize: 11, color: th.text3 }}>loading…</div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
      ...av, ...(css.vars as React.CSSProperties), ...thVars,
      background: th.pageBg, color: th.text,
    }}>
      <style>{`
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; border-color: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .rpill:hover:not(.on) { background: var(--accent-tint, #c47c5a22) !important; border-color: var(--accent, #c47c5a) !important; color: var(--accent, #c47c5a) !important; }
        .rpill.on:hover { background: var(--accent-dark, #a8653e) !important; }
        .topo-node:hover rect { filter: brightness(1.3); }
      `}</style>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 12px', height: 38, flexShrink: 0,
        background: th.hdrBg, borderBottom: `1px solid ${th.hdrBorder}`,
      }}>
        <span style={{ fontFamily: th.fontMain, fontSize: 12, color: th.text, marginRight: 8 }}>
          topology
        </span>
        <button
          className={`rpill${connectedOnly ? ' on' : ''}`}
          style={connectedOnly ? { background: accent, color: '#0c0d0e', borderColor: accent } : {}}
          onClick={() => setConnectedOnly(p => !p)}
        >connected only</button>
        <button
          className={`rpill${showPathfinder ? ' on' : ''}`}
          style={showPathfinder ? { background: accent, color: '#0c0d0e', borderColor: accent } : {}}
          onClick={() => setShowPathfinder(p => !p)}
        >pathfinder</button>

        <div style={{ flex: 1 }} />

        <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3 }}>
          {visibleDevices.length} nodes · {visibleConns.length} edges
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            className="btn-ghost"
            style={{
              padding: '3px 8px', borderRadius: 3,
              border: `1px solid ${th.border2}`, color: th.text2,
              fontFamily: th.fontLabel, fontSize: 11,
            }}
            onClick={() => setZoom(z => Math.min(z + 0.25, 3))}
          >+</button>
          <button
            className="btn-ghost"
            style={{
              padding: '3px 8px', borderRadius: 3,
              border: `1px solid ${th.border2}`, color: th.text2,
              fontFamily: th.fontLabel, fontSize: 11,
            }}
            onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}
          >−</button>
          <button
            className="btn-ghost"
            style={{
              padding: '3px 10px', borderRadius: 3,
              border: `1px solid ${th.border2}`, color: th.text2,
              fontFamily: th.fontLabel, fontSize: 11,
            }}
            onClick={resetView}
          >reset</button>
        </div>
      </div>

      {/* SVG canvas */}
      {devices.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <EmptyState
            icon="layers"
            title="no devices"
            subtitle="Add devices to see the topology graph"
          />
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
            onMouseMove={onSvgMouseMove}
            onMouseUp={onSvgMouseUp}
            onMouseLeave={onSvgMouseUp}
            onMouseDown={onBgMouseDown}
          >
            <defs>
              <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill={th.border3} />
              </marker>
            </defs>
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {visibleConns.map(conn => {
                const srcPos = positions[conn.srcDeviceId];
                const dstPos = positions[conn.dstDeviceId];
                if (!srcPos || !dstPos) return null;
                const src = edgeMidpoint(srcPos);
                const dst = edgeMidpoint(dstPos);
                const cableColor = conn.cableTypeId
                  ? (cableTypeMap.get(conn.cableTypeId)?.color ?? th.border3)
                  : th.border3;
                // Mid-point for label
                const mx = (src.cx + dst.cx) / 2;
                const my = (src.cy + dst.cy) / 2;
                const cableName = conn.cableTypeId
                  ? cableTypeMap.get(conn.cableTypeId)?.name
                  : undefined;
                return (
                  <g key={conn.id}>
                    <line
                      x1={src.cx} y1={src.cy}
                      x2={dst.cx} y2={dst.cy}
                      stroke={cableColor}
                      strokeWidth={1.5}
                      strokeOpacity={0.7}
                    />
                    {(conn.label || cableName) && (
                      <text
                        x={mx} y={my - 4}
                        textAnchor="middle"
                        fill={th.text3}
                        fontSize={9}
                        fontFamily={th.fontLabel}
                      >{conn.label || cableName}</text>
                    )}
                  </g>
                );
              })}

              {/* Nodes */}
              {visibleDevices.map(device => {
                const pos = positions[device.id];
                if (!pos) return null;
                const dt    = deviceTypeMap.get(device.typeId);
                const color = dt?.color ?? th.border3;
                return (
                  <g
                    key={device.id}
                    className="topo-node"
                    transform={`translate(${pos.x},${pos.y})`}
                    style={{ cursor: 'grab' }}
                    onMouseDown={e => onNodeMouseDown(e, device.id)}
                  >
                    <rect
                      width={NODE_W}
                      height={NODE_H}
                      rx={4}
                      fill={th.cardBg}
                      stroke={color}
                      strokeWidth={1.5}
                    />
                    <rect
                      width={4}
                      height={NODE_H}
                      rx={2}
                      fill={color}
                    />
                    <text
                      x={12}
                      y={NODE_H / 2 + 1}
                      dominantBaseline="middle"
                      fill={th.text}
                      fontSize={11}
                      fontFamily={th.fontData}
                    >{device.name.length > 14 ? device.name.slice(0, 13) + '…' : device.name}</text>
                    {dt && (
                      <text
                        x={NODE_W - 4}
                        y={NODE_H / 2 + 1}
                        textAnchor="end"
                        dominantBaseline="middle"
                        fill={color}
                        fontSize={9}
                        fontFamily={th.fontLabel}
                      >{dt.name.length > 8 ? dt.name.slice(0, 7) + '…' : dt.name}</text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Legend */}
          {legendTypes.length > 0 && (
            <div style={{
              position: 'absolute', bottom: 12, left: 12,
              padding: '8px 12px', borderRadius: 4,
              background: `${th.cardBg}ee`, border: `1px solid ${th.border2}`,
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <div style={{ fontFamily: th.fontLabel, fontSize: 9, color: th.text3, marginBottom: 2 }}>
                LEGEND
              </div>
              {legendTypes.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: t.color }} />
                  <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text2 }}>{t.name}</span>
                </div>
              ))}
              {visibleConns.length > 0 && (
                <>
                  <div style={{ height: 1, background: th.border, margin: '2px 0' }} />
                  {Array.from(
                    new Map<string, CableType>(
                      visibleConns
                        .filter(c => !!c.cableTypeId)
                        .reduce<Array<[string, CableType]>>((acc, c) => {
                          const ct = cableTypeMap.get(c.cableTypeId!);
                          if (ct) acc.push([ct.id, ct]);
                          return acc;
                        }, [])
                    ).values()
                  ).map(ct => (
                    <div key={ct.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 16, height: 2, background: ct.color }} />
                      <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text2 }}>{ct.name}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Zoom indicator */}
          <div style={{
            position: 'absolute', bottom: 12, right: 12,
            fontFamily: th.fontLabel, fontSize: 10, color: th.text3,
          }}>{Math.round(zoom * 100)}%</div>

          {/* Pathfinder panel */}
          {showPathfinder && (
            <div style={{
              position: 'absolute', top: 12, right: 12,
              width: 360, maxHeight: 'calc(100% - 24px)',
              overflowY: 'auto',
            }}>
              <PathfinderPanel
                accent={accent}
                onClose={() => setShowPathfinder(false)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
