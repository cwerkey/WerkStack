import { create } from 'zustand';
import type {
  DeviceType,
  PcieType,
  CableType,
  VmType,
  AppType,
  TicketCategory,
  TypesData,
} from '@werkstack/shared';

interface TypesState {
  deviceTypes:      DeviceType[];
  pcieTypes:        PcieType[];
  cableTypes:       CableType[];
  vmTypes:          VmType[];
  appTypes:         AppType[];
  ticketCategories: TicketCategory[];
  isLoaded:         boolean;

  setAll:               (data: TypesData) => void;
  reset:                () => void;

  upsertDeviceType:     (t: DeviceType)      => void;
  removeDeviceType:     (id: string)          => void;
  upsertPcieType:       (t: PcieType)         => void;
  removePcieType:       (id: string)          => void;
  upsertCableType:      (t: CableType)        => void;
  removeCableType:      (id: string)          => void;
  upsertVmType:         (t: VmType)           => void;
  removeVmType:         (id: string)          => void;
  upsertAppType:        (t: AppType)          => void;
  removeAppType:        (id: string)          => void;
  upsertTicketCategory: (t: TicketCategory)   => void;
  removeTicketCategory: (id: string)          => void;
}

const EMPTY: Omit<TypesState, keyof Omit<TypesState, 'deviceTypes' | 'pcieTypes' | 'cableTypes' | 'vmTypes' | 'appTypes' | 'ticketCategories' | 'isLoaded'>> = {
  deviceTypes:      [],
  pcieTypes:        [],
  cableTypes:       [],
  vmTypes:          [],
  appTypes:         [],
  ticketCategories: [],
  isLoaded:         false,
};

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some(x => x.id === item.id)
    ? list.map(x => x.id === item.id ? item : x)
    : [...list, item];
}

export const useTypesStore = create<TypesState>((set) => ({
  ...EMPTY,

  setAll: (data) => set({ ...data, isLoaded: true }),
  reset:  () => set({ ...EMPTY }),

  upsertDeviceType:     (t) => set(s => ({ deviceTypes:      upsert(s.deviceTypes,      t) })),
  removeDeviceType:     (id) => set(s => ({ deviceTypes:      s.deviceTypes.filter(x => x.id !== id) })),
  upsertPcieType:       (t) => set(s => ({ pcieTypes:         upsert(s.pcieTypes,         t) })),
  removePcieType:       (id) => set(s => ({ pcieTypes:         s.pcieTypes.filter(x => x.id !== id) })),
  upsertCableType:      (t) => set(s => ({ cableTypes:        upsert(s.cableTypes,        t) })),
  removeCableType:      (id) => set(s => ({ cableTypes:        s.cableTypes.filter(x => x.id !== id) })),
  upsertVmType:         (t) => set(s => ({ vmTypes:           upsert(s.vmTypes,           t) })),
  removeVmType:         (id) => set(s => ({ vmTypes:           s.vmTypes.filter(x => x.id !== id) })),
  upsertAppType:        (t) => set(s => ({ appTypes:          upsert(s.appTypes,          t) })),
  removeAppType:        (id) => set(s => ({ appTypes:          s.appTypes.filter(x => x.id !== id) })),
  upsertTicketCategory: (t) => set(s => ({ ticketCategories:  upsert(s.ticketCategories,  t) })),
  removeTicketCategory: (id) => set(s => ({ ticketCategories:  s.ticketCategories.filter(x => x.id !== id) })),
}));
