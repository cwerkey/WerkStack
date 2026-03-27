import { create } from 'zustand';
import type { Site } from '@werkstack/shared';

interface SiteState {
  sites:         Site[];
  activeSiteId:  string | null;
  setSites:      (sites: Site[]) => void;
  setActiveSite: (id: string | null) => void;
  upsertSite:    (site: Site) => void;
  removeSite:    (id: string) => void;
}

export const useSiteStore = create<SiteState>((set) => ({
  sites:        [],
  activeSiteId: null,

  setSites:      (sites)  => set({ sites }),
  setActiveSite: (id)     => set({ activeSiteId: id }),

  upsertSite: (site) =>
    set((state) => {
      const idx = state.sites.findIndex(s => s.id === site.id);
      if (idx >= 0) {
        const sites = [...state.sites];
        sites[idx] = site;
        return { sites };
      }
      return { sites: [...state.sites, site] };
    }),

  removeSite: (id) =>
    set((state) => ({
      sites: state.sites.filter(s => s.id !== id),
      activeSiteId: state.activeSiteId === id ? null : state.activeSiteId,
    })),
}));
