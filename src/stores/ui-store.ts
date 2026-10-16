'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface UiState {
  sidebarCollapsed: boolean;
  soundEnabled: boolean;
  toggleSidebar: () => void;
  setSoundEnabled: (v: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      soundEnabled: true,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSoundEnabled: (v) => set({ soundEnabled: v }),
    }),
    {
      name: 'gymos-ui',
      storage: createJSONStorage(() => {
        try {
          return window.localStorage;
        } catch {
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
      }),
    },
  ),
);
