import { useRef, useMemo } from 'react';
import { BLOCK_DEF_MAP } from '@werkstack/shared';
import type { PlacedBlock } from '@werkstack/shared';

// TemplateOverlay — THE renderer for device layouts (invariant #2).
// One component renders device layouts everywhere:
//   rack view, detail panel, storage screen, template editor, export.
// Never build parallel rendering logic.

interface TemplateOverlayProps {
  blocks:         PlacedBlock[];
  gridCols:       number;
  gridRows:       number;
  width:          number;
  selectedId?:    string | null;
  onBlockClick?:  (block: PlacedBlock) => void;
  showLabels?:    boolean;
  interactive?:   boolean;
  /** Override background color per block id — used by storage screen bay visualization */
  blockColors?:   Record<string, string>;
}

export function TemplateOverlay({
  blocks,
  gridCols,
  gridRows,
  width,
  selectedId,
  onBlockClick,
  showLabels = true,
  interactive = false,
  blockColors,
}: TemplateOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const cellW = width / gridCols;
  const height = cellW * gridRows;

  const renderedBlocks = useMemo(() =>
    blocks.map(block => {
      const def = BLOCK_DEF_MAP.get(block.type);
      const bw = block.rotated ? block.h : block.w;
      const bh = block.rotated ? block.w : block.h;
      const x = block.col * cellW;
      const y = block.row * cellW;
      const w = bw * cellW;
      const h = bh * cellW;

      const color       = blockColors?.[block.id] ?? def?.color ?? '#1e2022';
      const borderColor = def?.borderColor ?? '#3a4248';
      const isSelected  = selectedId === block.id;
      const label       = block.label || def?.label || block.type;

      return (
        <div
          key={block.id}
          data-block-id={block.id}
          onClick={onBlockClick ? () => onBlockClick(block) : undefined}
          style={{
            position: 'absolute',
            left: x,
            top: y,
            width: w,
            height: h,
            background: color,
            border: `1px solid ${isSelected ? 'var(--accent, #c47c5a)' : borderColor}`,
            borderRadius: 2,
            boxSizing: 'border-box',
            cursor: interactive ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: isSelected ? '0 0 0 1px var(--accent, #c47c5a)' : undefined,
            zIndex: isSelected ? 2 : 1,
          }}
        >
          {showLabels && w > 14 && h > 10 && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: Math.max(7, Math.min(9, Math.min(w / 5, h / 2.5))),
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
    }),
  [blocks, cellW, selectedId, onBlockClick, showLabels, interactive, blockColors]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width,
        height,
        background: 'var(--cardBg, #141618)',
        border: '1px solid var(--border2, #262c30)',
        borderRadius: 4,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {renderedBlocks}
    </div>
  );
}
