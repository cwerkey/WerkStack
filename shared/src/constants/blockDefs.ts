import type { BlockDef } from '../types';

// Block registry — 96×12 grid system (BUILD_PLAN.md canonical dimensions)
// 96 columns wide, 12 rows per 1U of rack height.

export const BLOCK_DEFS: BlockDef[] = [
  // ── Network Ports ──────────────────────────────────────────────────────────
  {
    type: 'rj45',    label: 'RJ45',    w: 3,  h: 3,  panel: 'all',   isPort: false, isNet: true,  isSlot: false, canRotate: false,
    color: '#1a3a4a', borderColor: '#2a6a8a',
  },
  {
    type: 'sfp',     label: 'SFP',     w: 4,  h: 3,  panel: 'all',   isPort: false, isNet: true,  isSlot: false, canRotate: false,
    color: '#1a3a3a', borderColor: '#2a7a6a',
  },
  {
    type: 'sfp+',    label: 'SFP+',    w: 4,  h: 3,  panel: 'all',   isPort: false, isNet: true,  isSlot: false, canRotate: false,
    color: '#1a3a3a', borderColor: '#3a8a7a',
  },
  {
    type: 'sfp28',   label: 'SFP28',   w: 4,  h: 3,  panel: 'all',   isPort: false, isNet: true,  isSlot: false, canRotate: false,
    color: '#1a3a3a', borderColor: '#4a9a8a',
  },
  {
    type: 'qsfp',    label: 'QSFP',    w: 6,  h: 4,  panel: 'all',   isPort: false, isNet: true,  isSlot: false, canRotate: false,
    color: '#1a2a4a', borderColor: '#2a5a9a',
  },
  {
    type: 'qsfp28',  label: 'QSFP28',  w: 6,  h: 4,  panel: 'all',   isPort: false, isNet: true,  isSlot: false, canRotate: false,
    color: '#1a2a4a', borderColor: '#3a6aaa',
  },

  // ── Peripheral Ports ───────────────────────────────────────────────────────
  {
    type: 'usb-a',      label: 'USB-A',        w: 3,  h: 3,  panel: 'all',   isPort: true, isNet: false, isSlot: false, canRotate: false,
    color: '#2a2a1a', borderColor: '#5a5a3a',
  },
  {
    type: 'usb-c',      label: 'USB-C',        w: 3,  h: 2,  panel: 'all',   isPort: true, isNet: false, isSlot: false, canRotate: false,
    color: '#2a2a1a', borderColor: '#6a6a4a',
  },
  {
    type: 'serial',     label: 'Serial (DB9)',  w: 4,  h: 3,  panel: 'all',   isPort: true, isNet: false, isSlot: false, canRotate: false,
    color: '#2a1a1a', borderColor: '#6a4a3a',
  },
  {
    type: 'hdmi',       label: 'HDMI',         w: 4,  h: 2,  panel: 'all',   isPort: true, isNet: false, isSlot: false, canRotate: false,
    color: '#1a1a2a', borderColor: '#4a4a7a',
  },
  {
    type: 'displayport', label: 'DisplayPort', w: 4,  h: 2,  panel: 'all',   isPort: true, isNet: false, isSlot: false, canRotate: false,
    color: '#1a1a2a', borderColor: '#5a5a8a',
  },
  {
    type: 'vga',        label: 'VGA (DE-15)',   w: 6,  h: 3,  panel: 'all',   isPort: true, isNet: false, isSlot: false, canRotate: false,
    color: '#2a1a1a', borderColor: '#7a5a4a',
  },
  {
    type: 'ipmi',       label: 'IPMI/iDRAC',   w: 4,  h: 4,  panel: 'rear',  isPort: false, isNet: true,  isSlot: false, canRotate: false,
    color: '#2a1a3a', borderColor: '#6a3a8a',
  },
  {
    type: 'misc-port',  label: 'Port',         w: 4,  h: 3,  panel: 'all',   isPort: true, isNet: false, isSlot: false, canRotate: false,
    color: '#1e2022', borderColor: '#3a4248',
  },

  // ── Drive Bays ─────────────────────────────────────────────────────────────
  {
    type: 'bay-3.5',    label: '3.5" Bay',     w: 22, h: 7,  panel: 'front', isPort: false, isNet: false, isSlot: true,  canRotate: false,
    color: '#1a2a1a', borderColor: '#3a6a3a',
  },
  {
    type: 'bay-2.5',    label: '2.5" Bay',     w: 16, h: 4,  panel: 'front', isPort: false, isNet: false, isSlot: true,  canRotate: true,
    color: '#1a2a2a', borderColor: '#3a6a6a',
  },
  {
    type: 'bay-2.5v',   label: '2.5" Bay (V)', w: 6,  h: 16, panel: 'front', isPort: false, isNet: false, isSlot: true,  canRotate: false,
    color: '#1a2a2a', borderColor: '#4a7a7a',
  },
  {
    type: 'bay-m2',     label: 'M.2 Slot',     w: 4,  h: 10, panel: 'all',   isPort: false, isNet: false, isSlot: true,  canRotate: true,
    color: '#2a2a1a', borderColor: '#6a6a3a',
  },
  {
    type: 'bay-u2',     label: 'U.2 Slot',     w: 4,  h: 4,  panel: 'all',   isPort: false, isNet: false, isSlot: true,  canRotate: false,
    color: '#2a2a1a', borderColor: '#5a5a3a',
  },
  {
    type: 'bay-flash',  label: 'Flash Slot',   w: 3,  h: 3,  panel: 'all',   isPort: false, isNet: false, isSlot: true,  canRotate: false,
    color: '#1a1a1a', borderColor: '#4a4a4a',
  },
  {
    type: 'bay-sd',     label: 'SD Slot',      w: 3,  h: 2,  panel: 'all',   isPort: false, isNet: false, isSlot: true,  canRotate: false,
    color: '#1a1a1a', borderColor: '#4a4a4a',
  },

  // ── Power ──────────────────────────────────────────────────────────────────
  {
    type: 'power',      label: 'Power (C14)',  w: 8,  h: 6,  panel: 'all',   isPort: false, isNet: false, isSlot: false, canRotate: false,
    color: '#2a1a1a', borderColor: '#8a3a3a',
  },

  // ── PCIe Brackets ──────────────────────────────────────────────────────────
  // Full-height: 4.75" × 0.75" → 4 cols × 33 rows on 96×12 grid
  {
    type: 'pcie-fh',    label: 'PCIe FH',      w: 4,  h: 33, panel: 'rear',  isPort: false, isNet: false, isSlot: true,  canRotate: false,
    color: '#1a1a2a', borderColor: '#4a4a8a',
  },
  // Low-profile single slot: 4 cols × 17 rows
  {
    type: 'pcie-lp',    label: 'PCIe LP',      w: 4,  h: 17, panel: 'rear',  isPort: false, isNet: false, isSlot: true,  canRotate: false,
    color: '#1a1a2a', borderColor: '#3a3a7a',
  },
  // Double-width (GPU/HBA): 8 cols × 33 rows
  {
    type: 'pcie-dw',    label: 'PCIe DW',      w: 8,  h: 33, panel: 'rear',  isPort: false, isNet: false, isSlot: true,  canRotate: false,
    color: '#1a1a2a', borderColor: '#5a4a9a',
  },

  // ── Misc / Filler ──────────────────────────────────────────────────────────
  {
    type: 'misc-small', label: 'Small Block',  w: 4,  h: 4,  panel: 'all',   isPort: false, isNet: false, isSlot: false, canRotate: true,
    color: '#1e2022', borderColor: '#2e3538',
  },
  {
    type: 'misc-med',   label: 'Medium Block', w: 8,  h: 6,  panel: 'all',   isPort: false, isNet: false, isSlot: false, canRotate: true,
    color: '#1e2022', borderColor: '#2e3538',
  },
  {
    type: 'misc-large', label: 'Large Block',  w: 16, h: 10, panel: 'all',   isPort: false, isNet: false, isSlot: false, canRotate: true,
    color: '#1e2022', borderColor: '#2e3538',
  },
];

export const BLOCK_DEF_MAP: Map<string, BlockDef> = new Map(
  BLOCK_DEFS.map(b => [b.type, b])
);
