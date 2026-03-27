import { create } from 'zustand';
import type { DeviceTemplate, PcieTemplate } from '@werkstack/shared';

interface TemplateState {
  deviceTemplates: DeviceTemplate[];
  pcieTemplates:   PcieTemplate[];
  isLoaded:        boolean;

  setDeviceTemplates: (t: DeviceTemplate[]) => void;
  setPcieTemplates:   (t: PcieTemplate[]) => void;
  setAll:             (d: DeviceTemplate[], p: PcieTemplate[]) => void;
  reset:              () => void;

  upsertDeviceTemplate: (t: DeviceTemplate) => void;
  removeDeviceTemplate: (id: string) => void;
  upsertPcieTemplate:   (t: PcieTemplate) => void;
  removePcieTemplate:   (id: string) => void;
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some(x => x.id === item.id)
    ? list.map(x => x.id === item.id ? item : x)
    : [...list, item];
}

export const useTemplateStore = create<TemplateState>((set) => ({
  deviceTemplates: [],
  pcieTemplates:   [],
  isLoaded:        false,

  setDeviceTemplates: (t) => set({ deviceTemplates: t }),
  setPcieTemplates:   (t) => set({ pcieTemplates: t }),
  setAll:             (d, p) => set({ deviceTemplates: d, pcieTemplates: p, isLoaded: true }),
  reset:              () => set({ deviceTemplates: [], pcieTemplates: [], isLoaded: false }),

  upsertDeviceTemplate: (t) => set(s => ({ deviceTemplates: upsert(s.deviceTemplates, t) })),
  removeDeviceTemplate: (id) => set(s => ({ deviceTemplates: s.deviceTemplates.filter(x => x.id !== id) })),
  upsertPcieTemplate:   (t) => set(s => ({ pcieTemplates: upsert(s.pcieTemplates, t) })),
  removePcieTemplate:   (id) => set(s => ({ pcieTemplates: s.pcieTemplates.filter(x => x.id !== id) })),
}));
