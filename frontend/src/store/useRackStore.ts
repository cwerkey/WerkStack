import { create } from 'zustand';
import type { Rack, DeviceInstance } from '@werkstack/shared';

interface RackStore {
  racks:   Rack[];
  devices: DeviceInstance[];
  isLoaded: boolean;

  setRacks:   (racks: Rack[]) => void;
  setDevices: (devices: DeviceInstance[]) => void;
  setAll:     (racks: Rack[], devices: DeviceInstance[]) => void;
  reset:      () => void;

  upsertRack:   (r: Rack) => void;
  removeRack:   (id: string) => void;
  upsertDevice: (d: DeviceInstance) => void;
  removeDevice: (id: string) => void;
}

export const useRackStore = create<RackStore>((set) => ({
  racks:    [],
  devices:  [],
  isLoaded: false,

  setRacks:   (racks) => set({ racks, isLoaded: true }),
  setDevices: (devices) => set({ devices }),
  setAll:     (racks, devices) => set({ racks, devices, isLoaded: true }),
  reset:      () => set({ racks: [], devices: [], isLoaded: false }),

  upsertRack: (r) => set((s) => {
    const idx = s.racks.findIndex(x => x.id === r.id);
    if (idx >= 0) {
      const next = [...s.racks];
      next[idx] = r;
      return { racks: next };
    }
    return { racks: [...s.racks, r] };
  }),

  removeRack: (id) => set((s) => ({
    racks: s.racks.filter(x => x.id !== id),
  })),

  upsertDevice: (d) => set((s) => {
    const idx = s.devices.findIndex(x => x.id === d.id);
    if (idx >= 0) {
      const next = [...s.devices];
      next[idx] = d;
      return { devices: next };
    }
    return { devices: [...s.devices, d] };
  }),

  removeDevice: (id) => set((s) => ({
    devices: s.devices.filter(x => x.id !== id),
  })),
}));
