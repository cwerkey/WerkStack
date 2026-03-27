import { create } from 'zustand';
import type { User } from '@werkstack/shared';

interface AuthState {
  user:         User | null;
  isLoading:    boolean;
  isHydrated:   boolean;
  setUser:      (user: User | null) => void;
  setLoading:   (loading: boolean) => void;
  setHydrated:  (hydrated: boolean) => void;
  logout:       () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user:        null,
  isLoading:   false,
  isHydrated:  false,

  setUser:     (user)     => set({ user }),
  setLoading:  (loading)  => set({ isLoading: loading }),
  setHydrated: (hydrated) => set({ isHydrated: hydrated }),
  logout:      ()         => set({ user: null, isHydrated: true }),
}));
