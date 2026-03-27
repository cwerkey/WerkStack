import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OsThemeMode = 'homelab-dark' | 'enterprise-dark' | 'enterprise-light';

export interface OsThemeTokens {
  // Backgrounds
  pageBg:   string;
  cardBg:   string;
  cardBg2:  string;
  rowBg:    string;
  inputBg:  string;
  // Header
  hdrBg:     string;
  hdrText:   string;
  hdrBorder: string;
  // Borders
  border:  string;
  border2: string;
  border3: string;
  // Text
  text:  string;
  text2: string;
  text3: string;
  // Semantic colors
  red:    string;
  green:  string;
  blue:   string;
  gold:   string;
  purple: string;
  // Tints
  vmTint:   string;
  appTint:  string;
  hostTint: string;
  infraBg:  string;
  // Profile
  profBg:   string;
  profText: string;
  // Fonts
  fontMain:  string;
  fontSub:   string;
  fontLabel: string;
  fontData:  string;
}

export const OS_THEME_TOKENS: Record<OsThemeMode, OsThemeTokens> = {
  'homelab-dark': {
    pageBg:   '#0f1011', cardBg:   '#141618', cardBg2:  '#0c0d0e',
    rowBg:    '#0a0c0e', inputBg:  '#1a1d20',
    hdrBg:    '#0c0d0e', hdrText:  '#d4d9dd', hdrBorder: '#262c30',
    border:   '#1d2022', border2:  '#262c30', border3:  '#2e3538',
    text:     '#d4d9dd', text2:    '#8a9299', text3:    '#4e5560',
    red:      '#c07070', green:    '#8ab89e', blue:     '#7090b8',
    gold:     '#b89870', purple:   '#aa8abb',
    vmTint:   '#7090b8', appTint:  '#8ab89e', hostTint: '#c07070',
    infraBg:  '#0c0d0e', profBg:   '#c47c5a', profText: '#0c0d0e',
    fontMain:  "'JetBrains Mono', monospace",
    fontSub:   "'JetBrains Mono', monospace",
    fontLabel: "'JetBrains Mono', monospace",
    fontData:  "'JetBrains Mono', monospace",
  },
  'enterprise-dark': {
      pageBg:   '#242424', cardBg:   '#2c2c2c', cardBg2:  '#282828',
      rowBg:    '#222222', inputBg:  '#363636',
      hdrBg:    '#1e1e1e', hdrText:  '#ededed', hdrBorder: '#3a3a3a',
      border:   '#3a3a3a', border2:  '#474747', border3:  '#5c5c5c',
      text:     '#ededed', text2:    '#b3b3b3', text3:    '#7a7a7a',
      red:      '#d17b7b', green:    '#8fbf9f', blue:     '#7fa8d8',
      gold:     '#d1b276', purple:   '#a890d0',
      vmTint:   '#7fa8d8', appTint:  '#8fbf9f', hostTint: '#d17b7b',
      infraBg:  '#282828', profBg:   '#c98a66', profText: '#0c0d0e',
      fontMain:  'Inter, system-ui, sans-serif',
      fontSub:   'Inter, system-ui, sans-serif',
      fontLabel: 'Inter, system-ui, sans-serif',
      fontData:  "'JetBrains Mono', monospace",
  },
  'enterprise-light': {
    pageBg:   '#dde0e5', cardBg:   '#f0f2f5', cardBg2:  '#e6e9ed',
    rowBg:    '#eaecf0', inputBg:  '#f0f2f5',
    hdrBg:    '#2c3a4a', hdrText:  '#e8ecf0', hdrBorder: '#3d4f62',
    border:   '#c8ccd3', border2:  '#b8bcc4', border3:  '#a0a5ae',
    text:     '#1a1d22', text2:    '#3e4654', text3:    '#6e7580',
    red:      '#a04040', green:    '#3a7856', blue:     '#2e5a8a',
    gold:     '#7a6030', purple:   '#6a4880',
    vmTint:   '#2e5a8a', appTint:  '#3a7856', hostTint: '#a04040',
    infraBg:  '#dde0e5', profBg:   '#c47c5a', profText: '#0c0d0e',
    fontMain:  'Inter, system-ui, sans-serif',
    fontSub:   'Inter, system-ui, sans-serif',
    fontLabel: 'Inter, system-ui, sans-serif',
    fontData:  "'JetBrains Mono', monospace",
  },
};

export const OS_THEME_LABELS: Record<OsThemeMode, string> = {
  'homelab-dark':     'homelab dark',
  'enterprise-dark':  'enterprise dark',
  'enterprise-light': 'enterprise light',
};

export const OS_THEME_DOT_COLOR: Record<OsThemeMode, string> = {
  'homelab-dark':     '#7090b8',
  'enterprise-dark':  '#a09890',
  'enterprise-light': '#2e5a8a',
};

// Helper: build CSS custom property map from theme tokens, for injecting at root
export function themeToVars(th: OsThemeTokens): Record<string, string> {
  return {
    '--pageBg':   th.pageBg,
    '--cardBg':   th.cardBg,
    '--cardBg2':  th.cardBg2,
    '--rowBg':    th.rowBg,
    '--inputBg':  th.inputBg,
    '--hdrBg':    th.hdrBg,
    '--hdrText':  th.hdrText,
    '--hdrBorder': th.hdrBorder,
    '--border':   th.border,
    '--border2':  th.border2,
    '--border3':  th.border3,
    '--text':     th.text,
    '--text2':    th.text2,
    '--text3':    th.text3,
    '--red':      th.red,
    '--green':    th.green,
    '--blue':     th.blue,
    '--gold':     th.gold,
    '--purple':   th.purple,
    '--vmTint':   th.vmTint,
    '--appTint':  th.appTint,
    '--hostTint': th.hostTint,
    '--infraBg':  th.infraBg,
  };
}

interface ThemeState {
  osTheme:    OsThemeMode;
  setOsTheme: (mode: OsThemeMode) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      osTheme:    'homelab-dark',
      setOsTheme: (mode) => set({ osTheme: mode }),
    }),
    { name: 'werkstack-theme' }
  )
);
