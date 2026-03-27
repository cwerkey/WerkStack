// Static layout constants — mode-independent, never change with theme.
// Colors and fonts are in useThemeStore.ts.

export const FONT_UI   = 'Inter, system-ui, sans-serif';
export const FONT_MONO = "'JetBrains Mono', monospace";
export const FONT_HERO = "'Ubuntu', sans-serif";

export const FS_BODY          = '13px';
export const FS_INTERACTIVE   = '11px';
export const FS_LABEL         = '10px';
export const FS_INPUT_LARGE   = '12px';

export const R  = '4px';
export const R2 = '6px';
export const R3 = '14px';

export const SIDEBAR_WIDTH   = '188px';
export const TOPBAR_HEIGHT   = '38px';
export const MODAL_MIN_WIDTH = '460px';
export const RACK_UNIT_HEIGHT = '40px';

export const INPUT_PAD = '5px 10px';
export const CARD_PAD  = '12px 14px';

export const Z = {
  base:    0,
  raised:  10,
  sticky:  100,
  modal:   1000,
  tooltip: 1200,
} as const;

export const DEFAULT_ACCENT = '#c47c5a';
