import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark';

interface TaxonomyColors {
  vlans: Record<string, string>;
  roles: Record<string, string>;
  types: Record<string, string>;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function darkenHex(hex: string, factor = 0.85): string {
  const [r, g, b] = hexToRgb(hex);
  return '#' + [r, g, b]
    .map(c => Math.round(c * factor).toString(16).padStart(2, '0'))
    .join('');
}

function injectAccentCSSVars(hex: string) {
  const root = document.documentElement;
  root.style.setProperty('--color-accent', hex);
  root.style.setProperty('--color-accent-dark', darkenHex(hex));
  root.style.setProperty('--color-accent-tint', hex + '18');
}

function injectTaxonomyCSSVars(taxonomy: TaxonomyColors) {
  const root = document.documentElement;
  // Clear old taxonomy vars
  const style = root.style;
  for (let i = style.length - 1; i >= 0; i--) {
    const prop = style.item(i);
    if (prop.startsWith('--color-vlan-') || prop.startsWith('--color-role-') || prop.startsWith('--color-type-')) {
      style.removeProperty(prop);
    }
  }
  // Inject new vars
  for (const [id, hex] of Object.entries(taxonomy.vlans)) {
    root.style.setProperty(`--color-vlan-${id}`, hex);
  }
  for (const [id, hex] of Object.entries(taxonomy.roles)) {
    root.style.setProperty(`--color-role-${id}`, hex);
  }
  for (const [id, hex] of Object.entries(taxonomy.types)) {
    root.style.setProperty(`--color-type-${id}`, hex);
  }
}

interface ThemeState {
  theme: ThemeMode;
  accentColor: string;
  deviceBg: string;
  taxonomy: TaxonomyColors;
  setTheme: (t: ThemeMode) => void;
  setAccent: (c: string) => void;
  setDeviceBg: (c: string) => void;
  loadTaxonomy: (t: TaxonomyColors) => void;
  injectTaxonomyCSSVars: () => void;
  setVlanColor: (id: string, color: string) => void;
  setRoleColor: (id: string, color: string) => void;
  setTypeColor: (id: string, color: string) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      accentColor: '#c47c5a',
      deviceBg: '#1e2022',
      taxonomy: { vlans: {}, roles: {}, types: {} },
      setTheme: (theme) => set({ theme }),
      setAccent: (accentColor) => {
        set({ accentColor });
        injectAccentCSSVars(accentColor);
      },
      setDeviceBg: (deviceBg) => {
        set({ deviceBg });
        document.documentElement.style.setProperty('--color-device-bg', deviceBg);
      },
      loadTaxonomy: (taxonomy) => {
        set({ taxonomy });
        injectTaxonomyCSSVars(taxonomy);
      },
      injectTaxonomyCSSVars: () => injectTaxonomyCSSVars(get().taxonomy),
      setVlanColor: (id, color) =>
        set((s) => {
          const taxonomy = { ...s.taxonomy, vlans: { ...s.taxonomy.vlans, [id]: color } };
          injectTaxonomyCSSVars(taxonomy);
          return { taxonomy };
        }),
      setRoleColor: (id, color) =>
        set((s) => {
          const taxonomy = { ...s.taxonomy, roles: { ...s.taxonomy.roles, [id]: color } };
          injectTaxonomyCSSVars(taxonomy);
          return { taxonomy };
        }),
      setTypeColor: (id, color) =>
        set((s) => {
          const taxonomy = { ...s.taxonomy, types: { ...s.taxonomy.types, [id]: color } };
          injectTaxonomyCSSVars(taxonomy);
          return { taxonomy };
        }),
    }),
    {
      name: 'werkstack-theme',
      onRehydrateStorage: () => (state) => {
        if (state?.accentColor) {
          injectAccentCSSVars(state.accentColor);
        }
        if (state?.deviceBg) {
          document.documentElement.style.setProperty('--color-device-bg', state.deviceBg);
        }
      },
    }
  )
);
