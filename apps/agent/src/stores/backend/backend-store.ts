import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { BackendId } from '@/types/backend';

interface BackendState {
  activeBackend: BackendId;
  opencodePort: number | null;
  opencodeHealthy: boolean;
  switchingBackend: boolean;
  setBackend: (backend: BackendId) => void;
  setOpencodePort: (port: number | null) => void;
  setOpencodeHealthy: (healthy: boolean) => void;
  setSwitchingBackend: (switching: boolean) => void;
}

export const useBackendStore = create<BackendState>()(
  persist(
    (set) => ({
      activeBackend: 'claude',
      opencodePort: null,
      opencodeHealthy: false,
      switchingBackend: false,
      setBackend: (activeBackend) => {
        set({ activeBackend });
      },
      setOpencodePort: (opencodePort) => {
        set({ opencodePort });
      },
      setOpencodeHealthy: (opencodeHealthy) => {
        set({ opencodeHealthy });
      },
      setSwitchingBackend: (switchingBackend) => {
        set({ switchingBackend });
      },
    }),
    {
      name: 'orbit-backend-mode',
      partialize: (state) => ({
        activeBackend: state.activeBackend,
      }),
    }
  )
);

export const useActiveBackend = (): BackendId => useBackendStore((state) => state.activeBackend);
export const useOpencodePort = (): number | null => useBackendStore((state) => state.opencodePort);
export const useOpencodeHealthy = (): boolean => useBackendStore((state) => state.opencodeHealthy);
export const useIsSwitchingBackend = (): boolean =>
  useBackendStore((state) => state.switchingBackend);
