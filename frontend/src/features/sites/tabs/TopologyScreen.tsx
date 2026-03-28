import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useOutletContext }    from 'react-router-dom';
import { useRackStore }        from '../../../store/useRackStore';
import { useTypesStore }       from '../../../store/useTypesStore';
import { useThemeStore, OS_THEME_TOKENS, themeToVars, type OsThemeTokens } from '../../../store/useThemeStore';
import { api }                 from '../../../utils/api';
import { EmptyState }          from '../../../components/ui/EmptyState';
import type { SiteCtx }        from '../../SiteShell';
import type { Connection, DeviceInstance, DeviceType, CableType, Rack } from '@werkstack/shared';
import { PathfinderPanel } from './pathfinder/PathfinderPanel';

// ── Layout constants ──────────────────────────────────────────────────────────
const NODE_W     = 110;
const NODE_H     = 30;
const HGAP       = 12;
const VGAP       = 56;
const PAD        = 32;
const MAX_ROW_W  = 620; // max row width (px) — keeps wide subtrees from blowing out layout

interface NodePos { x: number; y: number; }

// ── Root priority ─────────────────────────────────────────────────────────────
function getTypePriority(typeName: string): number {
  const n = typeName.toLowerCase();
  if (n.includes('firewall') || n.includes('router') || n.includes('gateway')) return 5;
  if (n.includes('switch'))   return 4;
  if (n.includes('patch'))    return 3;
  if (n.includes('pdu') || n.includes('kvm')) return 2;
  if (n.includes('shelf') || n.includes('server') || n.includes('nas')) return 1;
  return 0;
}

// ── Wrapped-grid tree layout ──────────────────────────────────────────────────
function hierarchicalLayout(
  devices: DeviceInstance[],
  conns: Connection[],
  deviceTypeMap: Map<string, DeviceType>,
): Record<string, NodePos> {
  if (devices.length === 0) return {};

  const nameOf = (id: string) => devices.find(d => d.id === id)?.name ?? '';

  // Build undirected adjacency
  const adj = new Map<string, Set<string>>();
  for (const d of devices) adj.set(d.id, new Set());
  for (const c of conns) {
    if (c.dstDeviceId && adj.has(c.srcDeviceId) && adj.has(c.dstDeviceId)) {
      adj.get(c.srcDeviceId)!.add(c.dstDeviceId);
      adj.get(c.dstDeviceId)!.add(c.srcDeviceId);
    }
  }

  const rootScore = (d: DeviceInstance) => {
    const typeName = deviceTypeMap.get(d.typeId)?.name ?? '';
    return getTypePriority(typeName) * 1000 + (adj.get(d.id)?.size ?? 0);
  };

  const sortedDevices = [...devices].sort((a, b) => rootScore(b) - rootScore(a));

  // BFS with parent tracking
  const parent   = new Map<string, string | null>();
  const children = new Map<string, string[]>();
  for (const d of devices) children.set(d.id, []);

  for (const root of sortedDevices) {
    if (parent.has(root.id)) continue;
    parent.set(root.id, null);
    const queue = [root.id];
    let qi = 0;
    while (qi < queue.length) {
      const id = queue[qi++];
      const neighbors = [...(adj.get(id) ?? [])].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
      for (const nb of neighbors) {
        if (!parent.has(nb)) {
          parent.set(nb, id);
          children.get(id)!.push(nb);
          queue.push(nb);
        }
      }
    }
  }

  const positions: Record<string, NodePos> = {};

  // Two-pass recursive: first call sizes, second call places
  function placeSubtree(id: string, x: number, y: number): { w: number; h: number } {
    const kids = children.get(id) ?? [];

    if (kids.length === 0) {
      positions[id] = { x, y };
      return { w: NODE_W, h: NODE_H };
    }

    // Measure all child subtrees first, then build width-aware rows
    const kidSizes = kids.map(k => placeSubtree(k, 0, 0));

    const rows: string[][] = [];
    let curRow: string[] = [];
    let curRowW = 0;
    for (let i = 0; i < kids.length; i++) {
      const kw = kidSizes[i].w;
      const addW = curRow.length === 0 ? kw : HGAP + kw;
      if (curRow.length > 0 && curRowW + addW > MAX_ROW_W) {
        rows.push(curRow);
        curRow = [kids[i]];
        curRowW = kw;
      } else {
        curRow.push(kids[i]);
        curRowW += addW;
      }
    }
    if (curRow.length > 0) rows.push(curRow);

    // Build row metadata from pre-computed sizes
    const kidSizeMap = new Map<string, { w: number; h: number }>(
      kids.map((k, i) => [k, kidSizes[i]])
    );
    const rowMeta = rows.map(row => {
      const sizes = row.map(k => kidSizeMap.get(k)!);
      const rowW  = sizes.reduce((s, { w }) => s + w + HGAP, -HGAP);
      const rowH  = sizes.reduce((m, { h }) => Math.max(m, h), 0);
      return { sizes, rowW, rowH };
    });

    const maxRowW    = rowMeta.reduce((m, r) => Math.max(m, r.rowW), 0);
    const blockW     = Math.max(NODE_W, maxRowW);
    const totalKidH  = rowMeta.reduce((s, r) => s + r.rowH + VGAP, 0);

    // Second pass: place at real coordinates
    let childY = y + NODE_H + VGAP;
    for (let ri = 0; ri < rows.length; ri++) {
      const row  = rows[ri];
      const meta = rowMeta[ri];
      let cx = x + (blockW - meta.rowW) / 2;
      for (let ci = 0; ci < row.length; ci++) {
        placeSubtree(row[ci], cx, childY);
        cx += meta.sizes[ci].w + HGAP;
      }
      childY += meta.rowH + VGAP;
    }

    positions[id] = { x: x + (blockW - NODE_W) / 2, y };
    return { w: blockW, h: NODE_H + totalKidH };
  }

  // Separate tree roots from isolated nodes
  const allRoots = [...parent.entries()]
    .filter(([, p]) => p === null)
    .map(([id]) => id)
    .sort((a, b) => {
      const da = devices.find(d => d.id === a);
      const db = devices.find(d => d.id === b);
      return da && db ? rootScore(db) - rootScore(da) : 0;
    });

  const treeRoots     = allRoots.filter(r => (children.get(r) ?? []).length > 0);
  const isolatedRoots = allRoots.filter(r => (children.get(r) ?? []).length === 0);
  const bfsMissed     = devices.filter(d => !parent.has(d.id)).map(d => d.id);
  const allIsolated   = [...isolatedRoots, ...bfsMissed];

  // Place tree roots side by side
  let curX = PAD;
  for (const r of treeRoots) {
    const { w } = placeSubtree(r, curX, PAD);
    curX += w + HGAP * 6;
  }

  // Grid isolated nodes below
  if (allIsolated.length > 0) {
    const treeMaxY = treeRoots.length > 0
      ? Object.values(positions).reduce((m, p) => Math.max(m, p.y), 0)
      : 0;
    const isoY    = treeMaxY + (treeRoots.length > 0 ? NODE_H + VGAP * 2 : PAD);
    const ISO_COLS = Math.min(12, allIsolated.length);
    allIsolated.forEach((id, i) => {
      positions[id] = {
        x: PAD + (i % ISO_COLS) * (NODE_W + HGAP),
        y: isoY + Math.floor(i / ISO_COLS) * (NODE_H + HGAP),
      };
    });
  }

  return positions;
}

// ── Bezier edge path ──────────────────────────────────────────────────────────
function bezierPath(src: NodePos, dst: NodePos): string {
  const x1 = src.x + NODE_W / 2;
  const y1 = src.y + NODE_H;
  const x2 = dst.x + NODE_W / 2;
  const y2 = dst.y;
  const cy  = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`;
}

// ── Left sidebar ──────────────────────────────────────────────────────────────
type FilterMode = { kind: 'all' } | { kind: 'rack'; rackId: string } | { kind: 'switch'; deviceId: string };

interface SidebarProps {
  racks:        Rack[];
  devices:      DeviceInstance[];
  conns:        Connection[];
  deviceTypeMap: Map<string, DeviceType>;
  filter:       FilterMode;
  onFilter:     (f: FilterMode) => void;
  th:           OsThemeTokens;
  accent:       string;
}

function TopologySidebar({ racks, devices, conns, deviceTypeMap, filter, onFilter, th, accent }: SidebarProps) {
  const switches = devices.filter(d => {
    const name = deviceTypeMap.get(d.typeId)?.name?.toLowerCase() ?? '';
    return name.includes('switch') || name.includes('firewall') || name.includes('router');
  });

  const rackCounts: Record<string, number> = {};
  for (const d of devices) {
    if (d.rackId) rackCounts[d.rackId] = (rackCounts[d.rackId] ?? 0) + 1;
  }

  const switchConnCounts: Record<string, number> = {};
  for (const sw of switches) {
    switchConnCounts[sw.id] = conns.filter(c =>
      c.srcDeviceId === sw.id || c.dstDeviceId === sw.id
    ).length;
  }

  const sectionLabel: React.CSSProperties = {
    fontFamily: th.fontLabel, fontSize: 9, color: th.text3,
    letterSpacing: '0.08em', padding: '10px 10px 4px',
  };
  const rowStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '5px 10px', cursor: 'pointer',
    background: active ? `${accent}22` : 'transparent',
    borderLeft: active ? `2px solid ${accent}` : '2px solid transparent',
  });

  return (
    <div style={{
      width: 172, flexShrink: 0, display: 'flex', flexDirection: 'column',
      borderRight: `1px solid ${th.hdrBorder}`,
      background: th.hdrBg, overflowY: 'auto',
    }}>
      <div style={sectionLabel}>RACKS</div>

      <div
        style={rowStyle(filter.kind === 'all')}
        onClick={() => onFilter({ kind: 'all' })}
      >
        <span style={{ fontFamily: th.fontLabel, fontSize: 11, color: filter.kind === 'all' ? accent : th.text2 }}>
          all devices
        </span>
        <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3, marginLeft: 'auto' }}>
          {devices.length}
        </span>
      </div>

      {racks.map(rack => {
        const active = filter.kind === 'rack' && filter.rackId === rack.id;
        const count  = rackCounts[rack.id] ?? 0;
        return (
          <div
            key={rack.id}
            style={rowStyle(active)}
            onClick={() => onFilter(active ? { kind: 'all' } : { kind: 'rack', rackId: rack.id })}
          >
            <div style={{ width: 6, height: 6, borderRadius: 1, background: th.border3, flexShrink: 0 }} />
            <span style={{
              fontFamily: th.fontLabel, fontSize: 11,
              color: active ? accent : th.text2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>{rack.name}</span>
            <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3, flexShrink: 0 }}>
              {count}
            </span>
          </div>
        );
      })}

      {switches.length > 0 && (
        <>
          <div style={{ height: 1, background: th.border, margin: '6px 0' }} />
          <div style={sectionLabel}>SWITCHES</div>

          {switches.map(sw => {
            const active = filter.kind === 'switch' && filter.deviceId === sw.id;
            const dt     = deviceTypeMap.get(sw.typeId);
            const connCount = switchConnCounts[sw.id] ?? 0;
            return (
              <div
                key={sw.id}
                style={rowStyle(active)}
                onClick={() => onFilter(active ? { kind: 'all' } : { kind: 'switch', deviceId: sw.id })}
              >
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: dt?.color ?? th.border3, flexShrink: 0,
                }} />
                <span style={{
                  fontFamily: th.fontLabel, fontSize: 11,
                  color: active ? accent : th.text2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                }}>{sw.name}</span>
                <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3, flexShrink: 0 }}>
                  {connCount}
                </span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function TopologyScreen() {
  const { site, accent, css } = useOutletContext<SiteCtx>();
  const av = { '--accent': accent } as React.CSSProperties;

  const osTheme = useThemeStore(s => s.osTheme);
  const th      = OS_THEME_TOKENS[osTheme];
  const thVars  = themeToVars(th) as React.CSSProperties;

  const allDevices  = useRackStore(s => s.devices);
  const racks       = useRackStore(s => s.racks);
  const deviceTypes = useTypesStore(s => s.deviceTypes);
  const cableTypes  = useTypesStore(s => s.cableTypes);

  const [conns,   setConns]   = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  // View state
  const [zoom,          setZoom]          = useState(1);
  const [pan,           setPan]           = useState<NodePos>({ x: 0, y: 0 });
  const [positions,     setPositions]     = useState<Record<string, NodePos>>({});
  const [connectedOnly, setConnectedOnly] = useState(true);  // default on
  const [showPathfinder, setShowPathfinder] = useState(false);
  const [cableFilter,   setCableFilter]   = useState<Set<string> | null>(null);
  const [sideFilter,    setSideFilter]    = useState<FilterMode>({ kind: 'all' });
  const [scrollZoom,    setScrollZoom]    = useState(false);

  // Drag state
  const dragRef    = useRef<{ nodeId: string; startMouse: NodePos; startPos: NodePos } | null>(null);
  const panRef     = useRef<{ startMouse: NodePos; startPan: NodePos } | null>(null);
  const svgRef     = useRef<SVGSVGElement>(null);

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

  // ── Derived maps ──────────────────────────────────────────────────────────
  const deviceTypeMap = useMemo(
    () => new Map<string, DeviceType>(deviceTypes.map(t => [t.id, t])),
    [deviceTypes]
  );
  const cableTypeMap = useMemo(
    () => new Map<string, CableType>(cableTypes.map(c => [c.id, c])),
    [cableTypes]
  );

  // ── Sidebar filter → device set ───────────────────────────────────────────
  const filteredByPanel: DeviceInstance[] = useMemo(() => {
    if (sideFilter.kind === 'all') return allDevices;
    if (sideFilter.kind === 'rack') {
      return allDevices.filter(d => d.rackId === sideFilter.rackId);
    }
    // switch: include the switch + all devices directly connected to it
    const swId = sideFilter.deviceId;
    const connected = new Set<string>([swId]);
    for (const c of conns) {
      if (c.srcDeviceId === swId && c.dstDeviceId) connected.add(c.dstDeviceId);
      if (c.dstDeviceId === swId) connected.add(c.srcDeviceId);
    }
    return allDevices.filter(d => connected.has(d.id));
  }, [sideFilter, allDevices, conns]);

  // ── Apply connectedOnly on top of panel filter ────────────────────────────
  const baseDevices: DeviceInstance[] = useMemo(() => {
    if (!connectedOnly) return filteredByPanel;
    return filteredByPanel.filter(d =>
      conns.some(c => c.srcDeviceId === d.id || c.dstDeviceId === d.id)
    );
  }, [filteredByPanel, connectedOnly, conns]);

  // ── Layout ────────────────────────────────────────────────────────────────
  const runLayout = useCallback(() => {
    if (baseDevices.length === 0) { setPositions({}); return; }
    const W = svgRef.current?.clientWidth  ?? 1000;
    const H = svgRef.current?.clientHeight ?? 600;

    const pos = hierarchicalLayout(baseDevices, conns, deviceTypeMap);

    // Add virtual cloud nodes for external connections
    const extGroups = new Map<string, string[]>(); // externalLabel → srcDeviceIds
    for (const c of conns) {
      if (c.externalLabel != null && pos[c.srcDeviceId]) {
        if (!extGroups.has(c.externalLabel)) extGroups.set(c.externalLabel, []);
        const group = extGroups.get(c.externalLabel)!;
        if (!group.includes(c.srcDeviceId)) group.push(c.srcDeviceId);
      }
    }
    for (const [label, srcIds] of extGroups) {
      const xs = srcIds.map(id => (pos[id]?.x ?? 0) + NODE_W / 2);
      const minY = Math.min(...srcIds.map(id => pos[id]?.y ?? 0));
      const cx = xs.reduce((s, x) => s + x, 0) / xs.length - NODE_W / 2;
      pos[`ext:${label}`] = { x: cx, y: minY - NODE_H - VGAP * 2 };
    }

    setPositions(pos);

    // Fit all nodes
    const xs = Object.values(pos).map(p => p.x);
    const ys = Object.values(pos).map(p => p.y);
    if (xs.length === 0) { setPan({ x: 0, y: 0 }); setZoom(1); return; }
    const minX = Math.min(...xs), maxX = Math.max(...xs) + NODE_W;
    const minY = Math.min(...ys), maxY = Math.max(...ys) + NODE_H;
    const MARGIN = 48;
    const fitZoom = Math.min(
      (W - MARGIN * 2) / (maxX - minX),
      (H - MARGIN * 2) / (maxY - minY),
      1,
    );
    setPan({
      x: (W - (maxX - minX) * fitZoom) / 2 - minX * fitZoom,
      y: (H - (maxY - minY) * fitZoom) / 2 - minY * fitZoom,
    });
    setZoom(fitZoom);
  }, [baseDevices, conns, deviceTypeMap]);

  // Trigger fresh layout when the base device set changes
  const baseKey = baseDevices.map(d => d.id).sort().join(',');
  const prevBaseKey = useRef('');
  useEffect(() => {
    if (baseKey !== prevBaseKey.current) {
      prevBaseKey.current = baseKey;
      setPositions({});
    }
  }, [baseKey]);

  useEffect(() => {
    if (Object.keys(positions).length === 0 && baseDevices.length > 0 && !loading) {
      // rAF ensures the SVG has been sized by the browser before we read clientWidth
      requestAnimationFrame(() => runLayout());
    }
  }, [positions, baseDevices.length, loading, runLayout]);

  // ── Drag handlers ─────────────────────────────────────────────────────────
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

  const onSvgMouseUp   = useCallback(() => { dragRef.current = null; panRef.current = null; }, []);

  const onBgMouseDown  = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest('.topo-node')) return;
    panRef.current = { startMouse: { x: e.clientX, y: e.clientY }, startPan: pan };
  }, [pan]);

  function onWheel(e: React.WheelEvent) {
    if (!scrollZoom) return;
    e.preventDefault();
    setZoom(z => Math.min(3, Math.max(0.1, z + (e.deltaY > 0 ? -0.1 : 0.1))));
  }

  // ── Cable filtering ────────────────────────────────────────────────────────
  const visibleDevices = baseDevices.filter(d => positions[d.id]);

  const allConnCableTypes = useMemo(() => Array.from(
    new Map<string, CableType>(
      conns.filter(c => !!c.cableTypeId)
        .reduce<[string, CableType][]>((acc, c) => {
          const ct = cableTypeMap.get(c.cableTypeId!);
          if (ct) acc.push([ct.id, ct]);
          return acc;
        }, [])
    ).values()
  ), [conns, cableTypeMap]);

  const visibleConns = conns.filter(c => {
    const hasSrc = !!positions[c.srcDeviceId];
    const hasDst = c.externalLabel != null
      ? !!positions[`ext:${c.externalLabel}`]
      : !!c.dstDeviceId && !!positions[c.dstDeviceId];
    if (!hasSrc || !hasDst) return false;
    if (cableFilter === null) return true;
    return c.cableTypeId ? cableFilter.has(c.cableTypeId) : false;
  });

  const legendDeviceTypes = Array.from(
    new Map(
      visibleDevices.map(d => deviceTypeMap.get(d.typeId)).filter(Boolean).map(t => [t!.id, t!])
    ).values()
  );

  function toggleCableType(ctId: string) {
    setCableFilter(prev => {
      if (prev === null) {
        const s = new Set(allConnCableTypes.map(c => c.id));
        s.delete(ctId);
        return s;
      }
      const next = new Set(prev);
      if (next.has(ctId)) { next.delete(ctId); } else { next.add(ctId); }
      return next.size === allConnCableTypes.length ? null : next;
    });
  }

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
        .act-primary:hover { background: var(--accent-dark, #a8653e) !important; }
        .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
        .rpill:hover:not(.on) { background: var(--accent-tint, #c47c5a22) !important; border-color: var(--accent, #c47c5a) !important; color: var(--accent, #c47c5a) !important; }
        .rpill.on:hover { background: var(--accent-dark, #a8653e) !important; }
        .topo-node { cursor: grab; }
        .topo-node:hover .node-body { filter: brightness(1.25); }
        .legend-cable-btn { background: none; border: none; cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 2px 4px; border-radius: 3px; width: 100%; }
        .legend-cable-btn:hover { background: #ffffff10; }
        .legend-cable-btn.dimmed { opacity: 0.35; }
        .topo-sidebar-row:hover { background: #ffffff08 !important; }
      `}</style>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap',
        padding: '0 12px', height: 38, flexShrink: 0,
        background: th.hdrBg, borderBottom: `1px solid ${th.hdrBorder}`,
      }}>
        <span style={{ fontFamily: th.fontMain, fontSize: 12, color: th.text, marginRight: 4, flexShrink: 0 }}>
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
        <button
          className={`rpill${scrollZoom ? ' on' : ''}`}
          style={scrollZoom ? { background: accent, color: '#0c0d0e', borderColor: accent } : {}}
          title="When on, scroll wheel zooms the canvas instead of scrolling the page"
          onClick={() => setScrollZoom(p => !p)}
        >scroll zoom</button>

        <div style={{ flex: 1 }} />

        <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text3, flexShrink: 0 }}>
          {visibleDevices.length} nodes · {visibleConns.length} edges
        </span>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button className="btn-ghost" title="Re-run layout" style={{ padding: '3px 10px', borderRadius: 3, border: `1px solid ${th.border2}`, color: th.text2, fontFamily: th.fontLabel, fontSize: 11 }} onClick={runLayout}>layout</button>
          <button className="btn-ghost" style={{ padding: '3px 8px', borderRadius: 3, border: `1px solid ${th.border2}`, color: th.text2, fontFamily: th.fontLabel, fontSize: 11 }} onClick={() => setZoom(z => Math.min(z + 0.15, 3))}>+</button>
          <button className="btn-ghost" style={{ padding: '3px 8px', borderRadius: 3, border: `1px solid ${th.border2}`, color: th.text2, fontFamily: th.fontLabel, fontSize: 11 }} onClick={() => setZoom(z => Math.max(z - 0.15, 0.1))}>−</button>
          <button className="btn-ghost" style={{ padding: '3px 10px', borderRadius: 3, border: `1px solid ${th.border2}`, color: th.text2, fontFamily: th.fontLabel, fontSize: 11 }} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>reset</button>
        </div>
      </div>

      {/* Body: sidebar + canvas */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Left sidebar */}
        <TopologySidebar
          racks={racks}
          devices={allDevices}
          conns={conns}
          deviceTypeMap={deviceTypeMap}
          filter={sideFilter}
          onFilter={f => { setSideFilter(f); setPositions({}); }}
          th={th}
          accent={accent}
        />

        {/* Canvas */}
        {baseDevices.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EmptyState icon="layers" title="no devices" subtitle="Adjust filters to see topology" />
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative', minWidth: 0 }}>
            {/* absolute fill so SVG height:100% resolves correctly */}
            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              style={{ display: 'block', position: 'absolute', inset: 0 }}
              onMouseMove={onSvgMouseMove}
              onMouseUp={onSvgMouseUp}
              onMouseLeave={onSvgMouseUp}
              onMouseDown={onBgMouseDown}
              onWheel={onWheel}
            >
              <defs>
                <pattern id="topo-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke={th.border} strokeWidth="0.5" strokeOpacity="0.35" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#topo-grid)" />

              <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                {/* Edges */}
                {visibleConns.map(conn => {
                  const srcPos = positions[conn.srcDeviceId];
                  const dstPos = conn.externalLabel != null
                    ? positions[`ext:${conn.externalLabel}`]
                    : (conn.dstDeviceId ? positions[conn.dstDeviceId] : undefined);
                  if (!srcPos || !dstPos) return null;
                  const cableColor = conn.cableTypeId
                    ? (cableTypeMap.get(conn.cableTypeId)?.color ?? th.border3)
                    : th.border3;
                  const d = bezierPath(srcPos, dstPos);
                  const mx = (srcPos.x + dstPos.x) / 2 + NODE_W / 2;
                  const my = (srcPos.y + dstPos.y) / 2 + NODE_H / 2;
                  const cableName = conn.cableTypeId ? cableTypeMap.get(conn.cableTypeId)?.name : undefined;
                  return (
                    <g key={conn.id}>
                      <path d={d} fill="none" stroke="transparent" strokeWidth={8} />
                      <path d={d} fill="none" stroke={cableColor} strokeWidth={1.5} strokeOpacity={0.75} />
                      {(conn.label || cableName) && (
                        <text x={mx} y={my - 6} textAnchor="middle" fill={th.text3} fontSize={9} fontFamily={th.fontLabel}>
                          {conn.label || cableName}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Cloud nodes (virtual external endpoints) */}
                {Object.entries(positions).filter(([k]) => k.startsWith('ext:')).map(([key, pos]) => {
                  const label = key.slice(4);
                  const truncLabel = label.length > 14 ? label.slice(0, 13) + '…' : label;
                  return (
                    <g
                      key={key}
                      className="topo-node"
                      transform={`translate(${pos.x},${pos.y})`}
                      onMouseDown={e => onNodeMouseDown(e, key)}
                    >
                      <rect className="node-body" width={NODE_W} height={NODE_H} rx={5}
                        fill={th.cardBg} stroke={th.text3} strokeWidth={1.5} strokeDasharray="5 3" />
                      <text x={NODE_W / 2} y={NODE_H / 2} textAnchor="middle" dominantBaseline="middle"
                        fill={th.text3} fontSize={10} fontFamily={th.fontLabel}>
                        ☁ {truncLabel}
                      </text>
                    </g>
                  );
                })}

                {/* Nodes */}
                {visibleDevices.map(device => {
                  const pos = positions[device.id];
                  if (!pos) return null;
                  const dt    = deviceTypeMap.get(device.typeId);
                  const color = dt?.color ?? th.border3;
                  const label = device.name.length > 15 ? device.name.slice(0, 14) + '…' : device.name;
                  const typeLabel = dt ? (dt.name.length > 10 ? dt.name.slice(0, 9) + '…' : dt.name) : '';

                  return (
                    <g
                      key={device.id}
                      className="topo-node"
                      transform={`translate(${pos.x},${pos.y})`}
                      onMouseDown={e => onNodeMouseDown(e, device.id)}
                    >
                      {/* Shadow */}
                      <rect className="node-body" width={NODE_W} height={NODE_H} rx={4} fill="#00000033" transform="translate(1,2)" />
                      {/* Background */}
                      <rect className="node-body" width={NODE_W} height={NODE_H} rx={4} fill={th.cardBg} stroke={color} strokeWidth={1.5} />
                      {/* Left bar */}
                      <rect width={5} height={NODE_H} rx={2} fill={color} />
                      <rect x={5} width={NODE_W - 5} height={NODE_H} fill={th.cardBg} />
                      <rect x={5} width={3} height={NODE_H} fill={color} opacity={0.2} />
                      {/* Name */}
                      <text x={12} y={NODE_H / 2 - (typeLabel ? 4 : 0)} dominantBaseline="middle" fill={th.text} fontSize={11} fontFamily={th.fontData} fontWeight={600}>
                        {label}
                      </text>
                      {/* Type */}
                      {typeLabel && (
                        <text x={12} y={NODE_H / 2 + 8} dominantBaseline="middle" fill={color} fontSize={8.5} fontFamily={th.fontLabel} opacity={0.85}>
                          {typeLabel}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Legend */}
            {(legendDeviceTypes.length > 0 || allConnCableTypes.length > 0) && (
              <div style={{
                position: 'absolute', bottom: 16, left: 16,
                padding: '8px 12px', borderRadius: 6,
                background: `${th.cardBg}f0`, border: `1px solid ${th.border2}`,
                display: 'flex', flexDirection: 'column', gap: 3,
                backdropFilter: 'blur(6px)',
                maxHeight: 'calc(100% - 80px)', overflowY: 'auto',
              }}>
                <div style={{ fontFamily: th.fontLabel, fontSize: 9, color: th.text3, marginBottom: 3, letterSpacing: '0.08em' }}>LEGEND</div>

                {legendDeviceTypes.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: t.color, flexShrink: 0 }} />
                    <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: th.text2 }}>{t.name}</span>
                  </div>
                ))}

                {allConnCableTypes.length > 0 && (
                  <>
                    <div style={{ height: 1, background: th.border, margin: '3px 0' }} />
                    {allConnCableTypes.map(ct => {
                      const active = cableFilter === null || cableFilter.has(ct.id);
                      return (
                        <button key={ct.id} className={`legend-cable-btn${active ? '' : ' dimmed'}`} onClick={() => toggleCableType(ct.id)}>
                          <div style={{ width: 18, height: 2.5, borderRadius: 2, background: ct.color, flexShrink: 0 }} />
                          <span style={{ fontFamily: th.fontLabel, fontSize: 10, color: active ? th.text2 : th.text3 }}>{ct.name}</span>
                        </button>
                      );
                    })}
                    {cableFilter !== null && (
                      <button className="legend-cable-btn" onClick={() => setCableFilter(null)} style={{ marginTop: 2 }}>
                        <span style={{ fontFamily: th.fontLabel, fontSize: 9, color: accent }}>show all cables</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Zoom indicator */}
            <div style={{ position: 'absolute', bottom: 16, right: 16, fontFamily: th.fontLabel, fontSize: 10, color: th.text3, pointerEvents: 'none' }}>
              {Math.round(zoom * 100)}%
            </div>

            {/* Pathfinder panel */}
            {showPathfinder && (
              <div style={{ position: 'absolute', top: 12, right: 12, width: 360, maxHeight: 'calc(100% - 24px)', overflowY: 'auto' }}>
                <PathfinderPanel accent={accent} onClose={() => setShowPathfinder(false)} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
