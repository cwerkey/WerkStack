import { create } from 'zustand';
import type { TypesData } from '@werkstack/shared';

interface TypesState extends TypesData {
  setAll: (data: TypesData) => void;
  reset: () => void;
}

const empty: TypesData = {
  deviceTypes: [],
  pcieTypes: [],
  cableTypes: [],
  vmTypes: [],
  appTypes: [],
  ticketCategories: [],
};

export const useTypesStore = create<TypesState>((set) => ({
  ...empty,
  setAll: (data) => set(data),
  reset: () => set(empty),
}));
