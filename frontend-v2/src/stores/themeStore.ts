import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark';

interface TaxonomyColors {
  vlans: Record<string, string>;
  roles: Record<string, string>;
  types: Record<string, string>;
}

interface ThemeState {
  theme: ThemeMode;
  accentColor: string;
  taxonomy: TaxonomyColors;
  setTheme: (t: ThemeMode) => void;
  setAccent: (c: string) => void;
  loadTaxonomy: (t: TaxonomyColors) => void;
  setVlanColor: (id: string, color: string) => void;
  setRoleColor: (id: string, color: string) => void;
  setTypeColor: (id: string, color: string) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      accentColor: '#c47c5a',
      taxonomy: { vlans: {}, roles: {}, types: {} },
      setTheme: (theme) => set({ theme }),
      setAccent: (accentColor) => set({ accentColor }),
      loadTaxonomy: (taxonomy) => set({ taxonomy }),
      setVlanColor: (id, color) =>
        set((s) => ({ taxonomy: { ...s.taxonomy, vlans: { ...s.taxonomy.vlans, [id]: color } } })),
      setRoleColor: (id, color) =>
        set((s) => ({ taxonomy: { ...s.taxonomy, roles: { ...s.taxonomy.roles, [id]: color } } })),
      setTypeColor: (id, color) =>
        set((s) => ({ taxonomy: { ...s.taxonomy, types: { ...s.taxonomy.types, [id]: color } } })),
    }),
    {
      name: 'werkstack-theme',
    }
  )
);
