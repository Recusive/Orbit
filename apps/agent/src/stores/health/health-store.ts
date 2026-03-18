import { create } from 'zustand';

import type { PreflightReport } from '@/types/health';

export interface HealthState {
  report: PreflightReport | null;
  setReport: (report: PreflightReport) => void;
  clearReport: () => void;
}

export const useHealthStore = create<HealthState>((set) => ({
  report: null,
  setReport: (report) => {
    set({ report });
  },
  clearReport: () => {
    set({ report: null });
  },
}));
