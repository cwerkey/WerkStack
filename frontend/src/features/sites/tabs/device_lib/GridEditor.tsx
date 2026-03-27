import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { BLOCK_DEF_MAP } from '@werkstack/shared';
import { uid } from '../../../../utils/uid';
import { Icon } from '../../../../components/ui/Icon';
import type { PlacedBlock, BlockDef, BlockMeta } from '@werkstack/shared';

interface GridEditorProps {
  blocks:        PlacedBlock[];
  gridCols:      number;
  gridRows:      number;
  onChange:       (blocks: PlacedBlock[]) => void;
  activeTool?:   BlockDef | null;
  onClearTool?:  () => void;
}

// Client-side collision detection
function hasCollision(blocks: PlacedBlock[], col: number, row: number, w: number, h: number, excludeId?: string): boolean {
  return blocks.some(b => {
    if (b.id === excludeId) return false;
    const bw = b.rotated ? b.h : b.w;
    const bh = b.rotated ? b.w : b.h;
    return col < b.col + bw && col + w > b.col && row < b.row + bh && row + h > b.row;
  });
}

function inBounds(col: number, row: number, w: number, h: number, gridCols: number, gridRows: number): boolean {
  return col >= 0 && row >= 0 && col + w <= gridCols && row + h <= gridRows;
}

// ── Context Menu types ─────────────────────────────────────────────────────
interface ContextMenuState {
  x: number;
  y: number;
  blockId: string;
}

const DRIVE_INTERFACES = ['SATA', 'SAS', 'NVMe', 'U.2', 'M.2 SATA', 'M.2 NVMe'];
const PCIE_LANE_SPEEDS = ['Gen 1', 'Gen 2', 'Gen 3', 'Gen 4', 'Gen 5'];
const PCIE_LANE_DEPTHS = ['x1', 'x4', 'x8', 'x16'];

function isPcieBlock(type: string): boolean {
  return type === 'pcie-fh' || type === 'pcie-lp' || type === 'pcie-dw';
}

function isDriveBlock(type: string): boolean {
  return type.startsWith('bay-');
}

function isNetBlock(type: string): boolean {
  const def = BLOCK_DEF_MAP.get(type);
  return def?.isNet ?? false;
}

export function GridEditor({ blocks, gridCols, gridRows, onChange, activeTool, onClearTool }: GridEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<{ col: number; row: number } | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [placeRotated, setPlaceRotated] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);

  // Reset rotation when tool changes; auto-focus grid so key events work immediately
  useEffect(() => {
    setPlaceRotated(false);
    if (activeTool) {
      containerRef.current?.focus();
    }
  }, [activeTool]);

  // Global R key listener for rotation — works even when grid doesn't have focus
  useEffect(() => {
    if (!activeTool?.canRotate) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setPlaceRotated(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTool]);

  // Close context menu on click outside
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [ctxMenu]);

  // Measure container width
  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      containerRef.current = node;
      const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width);
        }
      });
      observer.observe(node);
      setContainerWidth(node.clientWidth);
      return () => observer.disconnect();
    }
  }, []);

  const cellW = containerWidth > 0 ? containerWidth / gridCols : 0;
  const height = cellW * gridRows;

  const getCellFromEvent = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current || cellW === 0) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { col: Math.floor(x / cellW), row: Math.floor(y / cellW) };
  }, [cellW]);

  const handleGridClick = useCallback((e: React.MouseEvent) => {
    if (ctxMenu) { setCtxMenu(null); return; }
    const cell = getCellFromEvent(e);
    if (!cell) return;

    // If active tool, place a block
    if (activeTool) {
      const canRot = activeTool.canRotate && placeRotated;
      const w = canRot ? activeTool.h : activeTool.w;
      const h = canRot ? activeTool.w : activeTool.h;
      if (!inBounds(cell.col, cell.row, w, h, gridCols, gridRows)) return;
      if (hasCollision(blocks, cell.col, cell.row, w, h)) return;

      const newBlock: PlacedBlock = {
        id: uid(),
        type: activeTool.type,
        col: cell.col,
        row: cell.row,
        w: activeTool.w,
        h: activeTool.h,
        ...(canRot ? { rotated: true } : {}),
      };
      onChange([...blocks, newBlock]);
      return;
    }

    // Otherwise, try to select a block at this cell
    const clicked = blocks.find(b => {
      const bw = b.rotated ? b.h : b.w;
      const bh = b.rotated ? b.w : b.h;
      return cell.col >= b.col && cell.col < b.col + bw && cell.row >= b.row && cell.row < b.row + bh;
    });
    setSelectedId(clicked?.id ?? null);
  }, [getCellFromEvent, activeTool, blocks, gridCols, gridRows, onChange, placeRotated, ctxMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const cell = getCellFromEvent(e);
    if (!cell) return;

    const clicked = blocks.find(b => {
      const bw = b.rotated ? b.h : b.w;
      const bh = b.rotated ? b.w : b.h;
      return cell.col >= b.col && cell.col < b.col + bw && cell.row >= b.row && cell.row < b.row + bh;
    });
    if (clicked) {
      setSelectedId(clicked.id);
      setCtxMenu({ x: e.clientX, y: e.clientY, blockId: clicked.id });
    }
  }, [getCellFromEvent, blocks]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const cell = getCellFromEvent(e);
    setHoverCell(cell);
  }, [getCellFromEvent]);

  const handleMouseLeave = useCallback(() => {
    setHoverCell(null);
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedId) return;
    onChange(blocks.filter(b => b.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, blocks, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
      e.preventDefault();
      handleDeleteSelected();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (activeTool) {
        if (onClearTool) onClearTool();
        setPlaceRotated(false);
      } else {
        setSelectedId(null);
      }
      setCtxMenu(null);
    }
  }, [selectedId, handleDeleteSelected, onClearTool, activeTool]);

  // Helper to update a block's properties
  const updateBlock = useCallback((blockId: string, patch: Partial<PlacedBlock>) => {
    onChange(blocks.map(b => b.id === blockId ? { ...b, ...patch } : b));
  }, [blocks, onChange]);

  const updateBlockMeta = useCallback((blockId: string, metaPatch: Partial<BlockMeta>) => {
    onChange(blocks.map(b => {
      if (b.id !== blockId) return b;
      return { ...b, meta: { ...(b.meta ?? {}), ...metaPatch } };
    }));
  }, [blocks, onChange]);

  // Preview ghost for active tool (respects rotation)
  const ghost = useMemo(() => {
    if (!activeTool || !hoverCell || cellW === 0) return null;
    const canRot = activeTool.canRotate && placeRotated;
    const w = canRot ? activeTool.h : activeTool.w;
    const h = canRot ? activeTool.w : activeTool.h;
    const valid = inBounds(hoverCell.col, hoverCell.row, w, h, gridCols, gridRows) &&
                  !hasCollision(blocks, hoverCell.col, hoverCell.row, w, h);
    return {
      x: hoverCell.col * cellW,
      y: hoverCell.row * cellW,
      w: w * cellW,
      h: h * cellW,
      valid,
    };
  }, [activeTool, hoverCell, cellW, gridCols, gridRows, blocks, placeRotated]);

  // Grid lines
  const gridLines = useMemo(() => {
    if (cellW === 0) return null;
    const lines: React.ReactElement[] = [];
    // Vertical lines
    for (let c = 1; c < gridCols; c++) {
      lines.push(
        <line key={`v${c}`} x1={c * cellW} y1={0} x2={c * cellW} y2={height}
          stroke="var(--border, #1d2022)" strokeWidth={0.5} />
      );
    }
    // Horizontal lines
    for (let r = 1; r < gridRows; r++) {
      lines.push(
        <line key={`h${r}`} x1={0} y1={r * cellW} x2={containerWidth} y2={r * cellW}
          stroke="var(--border, #1d2022)" strokeWidth={0.5} />
      );
    }
    // U-height markers (every 12 rows)
    for (let r = 12; r < gridRows; r += 12) {
      lines.push(
        <line key={`u${r}`} x1={0} y1={r * cellW} x2={containerWidth} y2={r * cellW}
          stroke="var(--border2, #262c30)" strokeWidth={1} />
      );
    }
    return lines;
  }, [cellW, gridCols, gridRows, height, containerWidth]);

  const selectedBlock = selectedId ? blocks.find(b => b.id === selectedId) : null;
  const ctxBlock = ctxMenu ? blocks.find(b => b.id === ctxMenu.blockId) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 0',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
        color: 'var(--text3, #4e5560)',
      }}>
        <span>{gridCols}x{gridRows} grid</span>
        <span style={{ color: 'var(--border2, #262c30)' }}>|</span>
        <span>{blocks.length} blocks</span>
        {activeTool && (
          <>
            <span style={{ color: 'var(--border2, #262c30)' }}>|</span>
            <span style={{ color: 'var(--accent, #c47c5a)' }}>
              placing: {activeTool.label}{placeRotated ? ' (rotated)' : ''}
            </span>
            {activeTool.canRotate && (
              <span style={{ color: 'var(--text3, #4e5560)', fontSize: 9 }}>[R] rotate</span>
            )}
            <button className="modal-close-btn" onClick={onClearTool} style={{ padding: '1px 4px' }}>
              <Icon name="x" size={10} />
            </button>
          </>
        )}
        {selectedBlock && !activeTool && (
          <>
            <span style={{ color: 'var(--border2, #262c30)' }}>|</span>
            <span style={{ color: 'var(--text2, #8a9299)' }}>
              selected: {selectedBlock.label || BLOCK_DEF_MAP.get(selectedBlock.type)?.label || selectedBlock.type}
            </span>
            <button
              className="modal-close-btn"
              onClick={handleDeleteSelected}
              style={{ padding: '1px 4px', color: 'var(--red, #c07070)' }}
              title="Delete block (Del)"
            >
              <Icon name="trash" size={10} />
            </button>
          </>
        )}
      </div>

      {/* Grid */}
      <div
        ref={measureRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={handleGridClick}
        onContextMenu={handleContextMenu}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          position: 'relative',
          width: '100%',
          height: height || 200,
          background: 'var(--rowBg, #0a0c0e)',
          border: '1px solid var(--border2, #262c30)',
          borderRadius: 4,
          overflow: 'hidden',
          cursor: activeTool ? 'crosshair' : 'default',
          outline: 'none',
        }}
      >
        {/* Grid lines SVG */}
        {cellW > 0 && (
          <svg
            width={containerWidth}
            height={height}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          >
            {gridLines}
          </svg>
        )}

        {/* Placed blocks */}
        {cellW > 0 && blocks.map(block => {
          const def = BLOCK_DEF_MAP.get(block.type);
          const bw = block.rotated ? block.h : block.w;
          const bh = block.rotated ? block.w : block.h;
          const isSelected = selectedId === block.id;
          const label = block.label || def?.label || block.type;

          return (
            <div
              key={block.id}
              style={{
                position: 'absolute',
                left: block.col * cellW,
                top: block.row * cellW,
                width: bw * cellW,
                height: bh * cellW,
                background: def?.color ?? '#1e2022',
                border: `1px solid ${isSelected ? 'var(--accent, #c47c5a)' : (def?.borderColor ?? '#3a4248')}`,
                borderRadius: 2,
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                boxShadow: isSelected ? '0 0 0 1px var(--accent, #c47c5a)' : undefined,
                zIndex: isSelected ? 2 : 1,
                pointerEvents: 'none',
              }}
            >
              {bw * cellW > 14 && bh * cellW > 10 && (
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: Math.max(7, Math.min(9, Math.min(bw * cellW / 5, bh * cellW / 2.5))),
                  color: '#8a9299',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  padding: '0 2px',
                  lineHeight: 1,
                  userSelect: 'none',
                }}>
                  {label}
                </span>
              )}
            </div>
          );
        })}

        {/* Ghost preview */}
        {ghost && (
          <div
            style={{
              position: 'absolute',
              left: ghost.x,
              top: ghost.y,
              width: ghost.w,
              height: ghost.h,
              background: ghost.valid ? 'var(--accent-tint, #c47c5a22)' : 'rgba(192, 112, 112, 0.2)',
              border: `1px dashed ${ghost.valid ? 'var(--accent, #c47c5a)' : 'var(--red, #c07070)'}`,
              borderRadius: 2,
              pointerEvents: 'none',
              zIndex: 3,
            }}
          />
        )}
      </div>

      {/* ── Right-click context menu ──────────────────────────────────── */}
      {ctxMenu && ctxBlock && (
        <BlockContextMenu
          block={ctxBlock}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onUpdateBlock={updateBlock}
          onUpdateMeta={updateBlockMeta}
          onDelete={() => { onChange(blocks.filter(b => b.id !== ctxMenu.blockId)); setSelectedId(null); setCtxMenu(null); }}
        />
      )}
    </div>
  );
}

// ── Block Context Menu Component ───────────────────────────────────────────

interface BlockContextMenuProps {
  block: PlacedBlock;
  x: number;
  y: number;
  onClose: () => void;
  onUpdateBlock: (id: string, patch: Partial<PlacedBlock>) => void;
  onUpdateMeta: (id: string, metaPatch: Partial<BlockMeta>) => void;
  onDelete: () => void;
}

function BlockContextMenu({ block, x, y, onClose, onUpdateBlock, onUpdateMeta, onDelete }: BlockContextMenuProps) {
  const def = BLOCK_DEF_MAP.get(block.type);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [editLabel, setEditLabel] = useState(block.label ?? '');

  // Position adjustment to keep menu on screen
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
    position: 'fixed',
    left: pos.x,
    top: pos.y,
    zIndex: 2000,
    minWidth: 220,
    background: 'var(--cardBg, #141618)',
    border: '1px solid var(--border2, #262c30)',
    borderRadius: 6,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    padding: '6px 0',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: 'var(--text, #d4d9dd)',
  };

  const sectionStyle: React.CSSProperties = {
    padding: '4px 12px',
    fontSize: 9,
    color: 'var(--text3, #4e5560)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontWeight: 700,
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '4px 12px',
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '3px 6px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    background: 'var(--inputBg, #1a1d20)',
    border: '1px solid var(--border2, #262c30)',
    borderRadius: 3,
    color: 'var(--text, #d4d9dd)',
    outline: 'none',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  };

  return (
    <div ref={menuRef} style={menuStyle} onClick={stopProp}>
      {/* Header */}
      <div style={{ padding: '4px 12px 6px', borderBottom: '1px solid var(--border, #1d2022)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, color: 'var(--accent, #c47c5a)', fontSize: 10 }}>
          {def?.label ?? block.type}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text3, #4e5560)' }}>
          {block.w}x{block.h}{block.rotated ? ' (R)' : ''}
        </span>
      </div>

      {/* Name / Label */}
      <div style={sectionStyle}>Label</div>
      <div style={rowStyle}>
        <input
          style={inputStyle}
          value={editLabel}
          onChange={e => setEditLabel(e.target.value)}
          onBlur={() => onUpdateBlock(block.id, { label: editLabel || undefined })}
          onKeyDown={e => { if (e.key === 'Enter') { onUpdateBlock(block.id, { label: editLabel || undefined }); onClose(); } }}
          placeholder={def?.label ?? 'unnamed'}
        />
      </div>

      {/* Drive-specific options */}
      {isDriveBlock(block.type) && (
        <>
          <div style={sectionStyle}>Drive Settings</div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text2, #8a9299)', minWidth: 60 }}>Interface</span>
            <select
              style={selectStyle}
              value={block.meta?.driveInterface as string ?? ''}
              onChange={e => { onUpdateMeta(block.id, { driveInterface: e.target.value || undefined }); }}
            >
              <option value="">—</option>
              {DRIVE_INTERFACES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </>
      )}

      {/* PCIe-specific options */}
      {isPcieBlock(block.type) && (
        <>
          <div style={sectionStyle}>PCIe Slot Settings</div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text2, #8a9299)', minWidth: 60 }}>Lane Speed</span>
            <select
              style={selectStyle}
              value={block.meta?.laneSpeed as string ?? ''}
              onChange={e => { onUpdateMeta(block.id, { laneSpeed: e.target.value || undefined }); }}
            >
              <option value="">—</option>
              {PCIE_LANE_SPEEDS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text2, #8a9299)', minWidth: 60 }}>Lane Depth</span>
            <select
              style={selectStyle}
              value={block.meta?.laneCount as string ?? ''}
              onChange={e => { onUpdateMeta(block.id, { laneCount: e.target.value || undefined }); }}
            >
              <option value="">—</option>
              {PCIE_LANE_DEPTHS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text2, #8a9299)', minWidth: 60 }}>Dbl Height</span>
            <button
              style={{
                padding: '2px 10px',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                background: block.meta?.doubleHeight ? 'var(--accent, #c47c5a)' : 'transparent',
                color: block.meta?.doubleHeight ? '#fff' : 'var(--text2, #8a9299)',
                border: `1px solid ${block.meta?.doubleHeight ? 'var(--accent, #c47c5a)' : 'var(--border2, #262c30)'}`,
                borderRadius: 3, cursor: 'pointer',
              }}
              onClick={() => onUpdateMeta(block.id, { doubleHeight: block.meta?.doubleHeight ? undefined : 'yes' })}
            >
              {block.meta?.doubleHeight ? 'Yes' : 'No'}
            </button>
          </div>
        </>
      )}

      {/* Network port options */}
      {isNetBlock(block.type) && (
        <>
          <div style={sectionStyle}>Port Settings</div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text2, #8a9299)', minWidth: 60 }}>Speed</span>
            <input
              style={inputStyle}
              value={block.meta?.speed as string ?? ''}
              onChange={e => onUpdateMeta(block.id, { speed: e.target.value || undefined })}
              placeholder="1G, 10G, 25G..."
            />
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text2, #8a9299)', minWidth: 60 }}>VLAN</span>
            <input
              style={inputStyle}
              value={block.meta?.vlan as string ?? ''}
              onChange={e => onUpdateMeta(block.id, { vlan: e.target.value || undefined })}
              placeholder="100, trunk..."
            />
          </div>
        </>
      )}

      {/* Delete */}
      <div style={{ borderTop: '1px solid var(--border, #1d2022)', marginTop: 4, paddingTop: 4 }}>
        <button
          onClick={onDelete}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            width: '100%', textAlign: 'left',
            padding: '5px 12px',
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
            color: 'var(--red, #c07070)',
            background: 'transparent', border: 'none', cursor: 'pointer',
          }}
        >
          <Icon name="trash" size={10} />
          Delete Block
        </button>
      </div>
    </div>
  );
}
