import { uid } from '../../../../utils/uid';
import type { PlacedBlock, BlockType } from '@werkstack/shared';

export interface Preset {
  label: string;
  /** Returns true if the preset fits in the given grid */
  fits: (gridCols: number, gridRows: number) => boolean;
  /** Generate the blocks for this preset */
  generate: (gridCols: number, gridRows: number) => PlacedBlock[];
}

function makeBlocks(
  type: BlockType,
  w: number, h: number,
  positions: { col: number; row: number; rotated?: boolean }[],
): PlacedBlock[] {
  return positions.map(p => ({
    id: uid(),
    type,
    col: p.col,
    row: p.row,
    w,
    h,
    ...(p.rotated ? { rotated: true } : {}),
  }));
}

/** Generate a grid of blocks at regular intervals */
function gridLayout(
  type: BlockType,
  w: number, h: number,
  cols: number, rows: number,
  rotated?: boolean,
): PlacedBlock[] {
  const bw = rotated ? h : w;
  const bh = rotated ? w : h;
  const positions: { col: number; row: number; rotated?: boolean }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions.push({ col: c * bw, row: r * bh, rotated });
    }
  }
  return makeBlocks(type, w, h, positions);
}

/** Row of network ports with spacing */
function portRow(
  type: BlockType,
  w: number, h: number,
  count: number,
  startCol = 0, startRow = 0,
): PlacedBlock[] {
  const positions: { col: number; row: number }[] = [];
  for (let i = 0; i < count; i++) {
    positions.push({ col: startCol + i * w, row: startRow });
  }
  return makeBlocks(type, w, h, positions);
}

// ── 3.5" Drive Bay Presets (22w × 7h) ──────────────────────────────────────

const bay35Presets: Preset[] = [
  {
    label: '1U  4×1 (4 bays)',
    fits: (_c, r) => r >= 7,
    generate: () => gridLayout('bay-3.5', 22, 7, 4, 1),
  },
  {
    label: '2U  4×2 (8 bays)',
    fits: (_c, r) => r >= 14,
    generate: () => gridLayout('bay-3.5', 22, 7, 4, 2),
  },
  {
    label: '2U  4×3 (12 bays)',
    fits: (_c, r) => r >= 21,
    generate: () => gridLayout('bay-3.5', 22, 7, 4, 3),
  },
  {
    label: '3U  4×4 (16 bays)',
    fits: (_c, r) => r >= 28,
    generate: () => gridLayout('bay-3.5', 22, 7, 4, 4),
  },
];

// ── 2.5" Drive Bay Presets (16w × 4h, rotated = 4w × 16h) ─────────────────

const bay25Presets: Preset[] = [
  {
    label: '2U  24×1 rotated',
    fits: (c, r) => r >= 16 && c >= 96,
    generate: () => gridLayout('bay-2.5', 16, 4, 24, 1, true),
  },
  {
    label: '2U  16×1 rotated',
    fits: (c, r) => r >= 16 && c >= 64,
    generate: () => gridLayout('bay-2.5', 16, 4, 16, 1, true),
  },
  {
    label: '2U  8×1 rotated',
    fits: (c, r) => r >= 16 && c >= 32,
    generate: () => gridLayout('bay-2.5', 16, 4, 8, 1, true),
  },
  {
    label: '1U  6×2 (12 bays)',
    fits: (c, r) => r >= 8 && c >= 96,
    generate: () => gridLayout('bay-2.5', 16, 4, 6, 2),
  },
  {
    label: '1U  3 top-right + 6 under',
    fits: (c, r) => r >= 8 && c >= 96,
    generate: () => [
      // 3 bays top-right (starting at col 48)
      ...makeBlocks('bay-2.5', 16, 4, [
        { col: 48, row: 0 },
        { col: 64, row: 0 },
        { col: 80, row: 0 },
      ]),
      // 6 bays underneath (full row)
      ...makeBlocks('bay-2.5', 16, 4, [
        { col: 0, row: 4 },
        { col: 16, row: 4 },
        { col: 32, row: 4 },
        { col: 48, row: 4 },
        { col: 64, row: 4 },
        { col: 80, row: 4 },
      ]),
    ],
  },
  {
    label: '1U  3 top-left + 6 under',
    fits: (c, r) => r >= 8 && c >= 96,
    generate: () => [
      // 3 bays top-left
      ...makeBlocks('bay-2.5', 16, 4, [
        { col: 0, row: 0 },
        { col: 16, row: 0 },
        { col: 32, row: 0 },
      ]),
      // 6 bays underneath (full row)
      ...makeBlocks('bay-2.5', 16, 4, [
        { col: 0, row: 4 },
        { col: 16, row: 4 },
        { col: 32, row: 4 },
        { col: 48, row: 4 },
        { col: 64, row: 4 },
        { col: 80, row: 4 },
      ]),
    ],
  },
];

// ── Network Port Presets (generated per port type) ──────────────────────────

function netPresets(type: BlockType, w: number, h: number): Preset[] {
  return [4, 8, 12, 24].map(count => ({
    label: `${count} ports`,
    fits: (c: number, r: number) => c >= count * w && r >= h,
    generate: () => portRow(type, w, h, count),
  }));
}

// ── Preset registry keyed by block type ─────────────────────────────────────

const PRESET_MAP: Record<string, Preset[]> = {
  'bay-3.5':  bay35Presets,
  'bay-2.5':  bay25Presets,
  // Network ports
  'rj45':     netPresets('rj45', 3, 3),
  'sfp':      netPresets('sfp', 4, 3),
  'sfp+':     netPresets('sfp+', 4, 3),
  'sfp28':    netPresets('sfp28', 4, 3),
  'qsfp':     netPresets('qsfp', 6, 4),
  'qsfp28':   netPresets('qsfp28', 6, 4),
};

/** Offset all blocks so the group's top-left corner sits at (col, row) */
export function offsetPresetBlocks(blocks: PlacedBlock[], col: number, row: number): PlacedBlock[] {
  if (blocks.length === 0) return blocks;
  let minCol = Infinity, minRow = Infinity;
  for (const b of blocks) {
    if (b.col < minCol) minCol = b.col;
    if (b.row < minRow) minRow = b.row;
  }
  const dc = col - minCol;
  const dr = row - minRow;
  if (dc === 0 && dr === 0) return blocks;
  return blocks.map(b => ({ ...b, col: b.col + dc, row: b.row + dr }));
}

/** Get available presets for a block type, filtered by grid size */
export function getPresetsForType(
  blockType: string,
  gridCols: number,
  gridRows: number,
): Preset[] {
  const all = PRESET_MAP[blockType];
  if (!all) return [];
  return all.filter(p => p.fits(gridCols, gridRows));
}
