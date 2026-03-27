import { create } from 'zustand';
import type { Rack, DeviceInstance, Connection, Drive } from '@werkstack/shared';

interface RackStore {
  racks:       Rack[];
  devices:     DeviceInstance[];
  connections: Connection[];
  drives:      Drive[];
  isLoaded:    boolean;

  setRacks:       (racks: Rack[]) => void;
  setDevices:     (devices: DeviceInstance[]) => void;
  setConnections: (connections: Connection[]) => void;
  setDrives:      (drives: Drive[]) => void;
  setAll:         (racks: Rack[], devices: DeviceInstance[], connections: Connection[], drives: Drive[]) => void;
  reset:          () => void;

  upsertRack:       (r: Rack) => void;
  removeRack:       (id: string) => void;
  upsertDevice:     (d: DeviceInstance) => void;
  removeDevice:     (id: string) => void;
  upsertConnection: (c: Connection) => void;
  removeConnection: (id: string) => void;
  upsertDrive:      (d: Drive) => void;
  removeDrive:      (id: string) => void;
}

function upsertIn<T extends { id: string }>(arr: T[], item: T): T[] {
  const idx = arr.findIndex(x => x.id === item.id);
  if (idx >= 0) { const next = [...arr]; next[idx] = item; return next; }
  return [...arr, item];
}

export const useRackStore = create<RackStore>((set) => ({
  racks:       [],
  devices:     [],
  connections: [],
  drives:      [],
  isLoaded:    false,

  setRacks:       (racks) => set({ racks, isLoaded: true }),
  setDevices:     (devices) => set({ devices }),
  setConnections: (connections) => set({ connections }),
  setDrives:      (drives) => set({ drives }),
  setAll:         (racks, devices, connections, drives) => set({ racks, devices, connections, drives, isLoaded: true }),
  reset:          () => set({ racks: [], devices: [], connections: [], drives: [], isLoaded: false }),

  upsertRack:       (r) => set((s) => ({ racks: upsertIn(s.racks, r) })),
  removeRack:       (id) => set((s) => ({ racks: s.racks.filter(x => x.id !== id) })),
  upsertDevice:     (d) => set((s) => ({ devices: upsertIn(s.devices, d) })),
  removeDevice:     (id) => set((s) => ({ devices: s.devices.filter(x => x.id !== id) })),
  upsertConnection: (c) => set((s) => ({ connections: upsertIn(s.connections, c) })),
  removeConnection: (id) => set((s) => ({ connections: s.connections.filter(x => x.id !== id) })),
  upsertDrive:      (d) => set((s) => ({ drives: upsertIn(s.drives, d) })),
  removeDrive:      (id) => set((s) => ({ drives: s.drives.filter(x => x.id !== id) })),
}));
