import { create } from 'zustand';
import type { Site, Zone, Rack } from '@werkstack/shared';

interface SiteState {
  sites: Site[];
  currentSite: Site | null;
  zones: Zone[];
  racks: Rack[];
  setSites: (sites: Site[]) => void;
  setSite: (site: Site | null) => void;
  setZones: (zones: Zone[]) => void;
  setRacks: (racks: Rack[]) => void;
  reset: () => void;
}

export const useSiteStore = create<SiteState>((set) => ({
  sites: [],
  currentSite: null,
  zones: [],
  racks: [],
  setSites: (sites) => set({ sites }),
  setSite: (currentSite) => set({ currentSite }),
  setZones: (zones) => set({ zones }),
  setRacks: (racks) => set({ racks }),
  reset: () => set({ currentSite: null, zones: [], racks: [] }),
}));
