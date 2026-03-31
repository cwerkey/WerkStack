import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@werkstack/shared';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  hydrated: boolean;
  setUser: (user: User | null) => void;
  setHydrated: (v: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      hydrated: false,
      setUser: (user) => set({ user, isAuthenticated: user !== null }),
      setHydrated: (hydrated) => set({ hydrated }),
      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: 'werkstack-auth',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
