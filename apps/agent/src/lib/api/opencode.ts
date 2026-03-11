import { invoke, listen } from './core';

export interface OpenCodeStatus {
  running: boolean;
  port: number | null;
  healthy: boolean;
  binaryPath: string | null;
  error: string | null;
}

export interface OpenCodeReadyEvent {
  port: number;
}

export interface OpenCodeCrashedEvent {
  error?: string;
  reason?: string;
}

export async function opencodeStart(): Promise<number> {
  return invoke<number>('opencode_start');
}

export async function opencodeStop(): Promise<void> {
  await invoke('opencode_stop');
}

export async function opencodeStatus(): Promise<OpenCodeStatus> {
  return invoke<OpenCodeStatus>('opencode_status');
}

export async function onOpencodeReady(
  callback: (event: OpenCodeReadyEvent) => void
): Promise<() => void> {
  return listen<OpenCodeReadyEvent>('opencode:ready', callback);
}

export async function onOpencodeCrashed(
  callback: (event: OpenCodeCrashedEvent) => void
): Promise<() => void> {
  return listen<OpenCodeCrashedEvent>('opencode:crashed', callback);
}
