// makeCSS — derives per-site accent tokens from a single hex color.
// Returns a CSSTheme with a `vars` object to spread onto root elements.

export interface CSSTheme {
  accent:          string;
  accentDark:      string;
  accentTint:      string;
  accentTintS:     string;
  accentText:      string;
  accentHoverText: string;
  vars:            Record<string, string>;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('');
}

function darkenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r - amount, g - amount, b - amount);
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function makeCSS(accentHex: string): CSSTheme {
  const accent      = accentHex;
  const accentDark  = darkenHex(accentHex, 22);
  const accentTint  = accentHex + '22';
  const accentTintS = accentHex + '18';
  // Use dark text on light accents, light text on dark accents
  const accentText      = luminance(accentHex) > 0.35 ? '#0c0d0e' : '#0c0d0e';
  const accentHoverText = '#d4906a';

  return {
    accent,
    accentDark,
    accentTint,
    accentTintS,
    accentText,
    accentHoverText,
    vars: {
      '--accent':           accent,
      '--accent-dark':      accentDark,
      '--accent-tint':      accentTint,
      '--accent-tint-s':    accentTintS,
      '--accent-text':      accentText,
      '--accent-hover-text': accentHoverText,
    },
  };
}
