import { useRef, useMemo } from 'react';
import { BLOCK_DEF_MAP } from '@werkstack/shared';
import type { PlacedBlock } from '@werkstack/shared';
import styles from './TemplateOverlay.module.css';

interface TemplateOverlayProps {
  blocks:         PlacedBlock[];
  gridCols:       number;
  gridRows:       number;
  width:          number;
  height?:        number;
  selectedId?:    string | null;
  onBlockClick?:  (block: PlacedBlock) => void;
  onBlockContextMenu?: (block: PlacedBlock, e: React.MouseEvent) => void;
  onBlockDoubleClick?: (block: PlacedBlock, e: React.MouseEvent) => void;
  onBlockMouseEnter?:  (block: PlacedBlock, e: React.MouseEvent) => void;
  onBlockMouseLeave?:  () => void;
  showLabels?:    boolean;
  interactive?:   boolean;
  blockColors?:   Record<string, string>;
  blockBorderColors?: Record<string, string>;
  blockOpacity?:  Record<string, number>;
  blockLabels?:   Record<string, string>;
  /** Maps blockId → short badge text rendered in the top-left corner (e.g. PCIe card name) */
  blockBadge?:    Record<string, string>;
  /** Maps blockId → CSS border-style value (e.g. 'dashed', 'dotted') */
  blockBorderStyle?: Record<string, string>;
}

export function TemplateOverlay({
  blocks, gridCols, gridRows, width, height: heightProp,
  selectedId, onBlockClick, onBlockContextMenu, onBlockDoubleClick, onBlockMouseEnter, onBlockMouseLeave,
  showLabels = true, interactive = false,
  blockColors, blockBorderColors, blockOpacity, blockLabels,
  blockBadge, blockBorderStyle,
}: TemplateOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cellW = width / gridCols;
  const cellH = heightProp != null ? heightProp / gridRows : cellW;
  const height = cellH * gridRows;

  const renderedBlocks = useMemo(() =>
    blocks.map(block => {
      const def = BLOCK_DEF_MAP.get(block.type);
      const bw = block.rotated ? block.h : block.w;
      const bh = block.rotated ? block.w : block.h;
      const x = block.col * cellW;
      const y = block.row * cellH;
      const w = bw * cellW;
      const h = bh * cellH;
      const color       = blockColors?.[block.id] ?? def?.color ?? 'var(--color-device-bg, #1e2022)';
      const borderColor = blockBorderColors?.[block.id] ?? def?.borderColor ?? '#3a4248';
      const opacity     = blockOpacity?.[block.id] ?? 1;
      const isSelected  = selectedId === block.id;
      const label       = blockLabels?.[block.id] ?? (block.label || def?.label || block.type);
      const badge       = blockBadge?.[block.id];
      const borderSt    = isSelected ? 'solid' : (blockBorderStyle?.[block.id] ?? 'solid');

      return (
        <div
          key={block.id}
          data-block-id={block.id}
          onClick={onBlockClick ? () => onBlockClick(block) : undefined}
          onContextMenu={onBlockContextMenu ? (e) => { e.preventDefault(); onBlockContextMenu(block, e); } : undefined}
          onDoubleClick={onBlockDoubleClick ? (e) => onBlockDoubleClick(block, e) : undefined}
          onMouseEnter={onBlockMouseEnter ? (e) => onBlockMouseEnter(block, e) : undefined}
          onMouseLeave={onBlockMouseLeave || undefined}
          style={{
            position: 'absolute',
            left: x, top: y, width: w, height: h,
            background: color,
            border: `1px ${borderSt} ${isSelected ? 'var(--accent, #c47c5a)' : borderColor}`,
            borderRadius: 2,
            boxSizing: 'border-box',
            cursor: interactive ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: isSelected ? '0 0 0 1px var(--accent, #c47c5a)' : undefined,
            zIndex: isSelected ? 2 : 1,
            opacity,
          }}
        >
          {badge && (
            <span style={{
              position: 'absolute',
              top: 1,
              left: 2,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 6,
              lineHeight: 1,
              color: 'var(--accent, #c47c5a)',
              background: 'rgba(0,0,0,0.6)',
              padding: '1px 2px',
              borderRadius: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              maxWidth: '90%',
              textOverflow: 'ellipsis',
              pointerEvents: 'none',
              zIndex: 3,
            }}>
              ◈
            </span>
          )}
          {showLabels && w > 14 && h > 10 && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: Math.max(7, Math.min(9, Math.min(w / 5, h / 2.5))),
              color: '#8a9299',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              padding: '0 2px', lineHeight: 1, userSelect: 'none',
            }}>
              {label}
            </span>
          )}
        </div>
      );
    }),
  [blocks, cellW, cellH, selectedId, onBlockClick, onBlockContextMenu, onBlockDoubleClick, onBlockMouseEnter, onBlockMouseLeave, showLabels, interactive, blockColors, blockBorderColors, blockOpacity, blockLabels, blockBadge, blockBorderStyle]);

  return (
    <div ref={containerRef} className={styles.container} style={{ width, height }}>
      {renderedBlocks}
    </div>
  );
}
