import { create } from 'zustand';

export type DrawerTab = 'info' | 'ports' | 'storage' | 'os' | 'network' | 'guides';

interface NavState {
  selectedZoneId: string | null;
  selectedRackId: string | null;
  selectedDeviceId: string | null;
  drawerOpen: boolean;
  drawerTab: DrawerTab;
  setZone: (id: string | null) => void;
  setRack: (id: string | null) => void;
  selectDevice: (id: string | null, tab?: DrawerTab) => void;
  closeDrawer: () => void;
  setDrawerTab: (tab: DrawerTab) => void;
}

export const useNavStore = create<NavState>((set) => ({
  selectedZoneId: null,
  selectedRackId: null,
  selectedDeviceId: null,
  drawerOpen: false,
  drawerTab: 'info',
  setZone: (id) => set({ selectedZoneId: id, selectedRackId: null }),
  setRack: (id) => set({ selectedRackId: id }),
  selectDevice: (id, tab = 'info') => set({
    selectedDeviceId: id,
    drawerOpen: id !== null,
    drawerTab: tab,
  }),
  closeDrawer: () => set({ drawerOpen: false, selectedDeviceId: null }),
  setDrawerTab: (tab) => set({ drawerTab: tab }),
}));
