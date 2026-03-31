import { create } from 'zustand';
import type { DeviceTemplate, PcieTemplate } from '@werkstack/shared';

interface TemplateState {
  deviceTemplates: DeviceTemplate[];
  pcieTemplates: PcieTemplate[];
  setAll: (devices: DeviceTemplate[], pcie: PcieTemplate[]) => void;
  reset: () => void;
}

export const useTemplateStore = create<TemplateState>((set) => ({
  deviceTemplates: [],
  pcieTemplates: [],
  setAll: (deviceTemplates, pcieTemplates) => set({ deviceTemplates, pcieTemplates }),
  reset: () => set({ deviceTemplates: [], pcieTemplates: [] }),
}));
