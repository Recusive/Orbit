import { invoke, listen } from './core';

import type { PreflightReport } from '@/types/health';

export async function getPreflightReport(): Promise<PreflightReport> {
  return invoke<PreflightReport>('get_preflight_report');
}

export async function onPreflightReport(
  callback: (report: PreflightReport) => void
): Promise<() => void> {
  return listen<PreflightReport>('preflight:report', callback);
}
