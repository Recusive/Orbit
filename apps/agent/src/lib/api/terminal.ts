/**
 * Terminal Operations
 *
 * Functions for creating and managing PTY terminals.
 */

import { invoke, listen, decodeBase64 } from './core';

// ============================================
// Types
// ============================================

export interface TerminalInfo {
  id: string;
  pid: number;
  shell: string;
  cwd: string;
}

export interface TerminalOutputEvent {
  id: string;
  data: string;
}

export interface TerminalExitEvent {
  id: string;
  code: number;
}

/** Event emitted when the terminal foreground process changes. */
export interface TerminalForegroundEvent {
  /** Terminal ID. */
  id: string;
  /** Process name (e.g., "zsh", "node", "python"). */
  process_name: string;
  /** Process ID. */
  pid: number;
}

export interface TerminalPromptEvent {
  id: string;
  promptType?: 'primary' | 'continuation' | 'secondary';
}

export type TerminalSignal = 'SIGINT' | 'SIGTERM' | 'SIGKILL';

// Internal interface for raw base64 terminal output from backend
interface RawTerminalOutputEvent {
  id: string;
  data: string; // base64 encoded
}

// ============================================
// Terminal Operations
// ============================================

export async function createTerminal(
  id: string,
  cwd?: string,
  shell?: string,
  cols?: number,
  rows?: number
): Promise<TerminalInfo> {
  return invoke<TerminalInfo>('terminal_create', { id, cwd, shell, cols, rows });
}

export async function writeTerminal(id: string, data: string): Promise<void> {
  return invoke('terminal_write', { id, data });
}

export async function resizeTerminal(id: string, cols: number, rows: number): Promise<void> {
  return invoke('terminal_resize', { id, cols, rows });
}

export async function closeTerminal(id: string): Promise<void> {
  return invoke('terminal_close', { id });
}

export async function listTerminals(): Promise<string[]> {
  return invoke<string[]>('terminal_list');
}

export async function onTerminalOutput(
  callback: (data: TerminalOutputEvent) => void
): Promise<() => void> {
  return listen<RawTerminalOutputEvent>('terminal:output', (raw): void => {
    // Decode base64 data to string
    const decoded = decodeBase64(raw.data);
    callback({
      id: raw.id,
      data: decoded,
    });
  });
}

export async function onTerminalExit(
  callback: (data: TerminalExitEvent) => void
): Promise<() => void> {
  return listen<TerminalExitEvent>('terminal:exit', callback);
}

export async function onTerminalForeground(
  callback: (data: TerminalForegroundEvent) => void
): Promise<() => void> {
  return listen<TerminalForegroundEvent>('terminal:foreground', callback);
}

/**
 * Send a signal to a terminal process.
 * - SIGINT: Interrupt (Ctrl+C)
 * - SIGTERM: Graceful termination
 * - SIGKILL: Force kill
 */
export async function sendTerminalSignal(id: string, signal: TerminalSignal): Promise<void> {
  return invoke('terminal_signal', { id, signal });
}

/**
 * Acknowledge data received from a terminal (for flow control).
 * Call this after processing terminal output to prevent buffer overflow.
 */
export async function acknowledgeTerminalData(id: string, byteCount: number): Promise<void> {
  return invoke('terminal_acknowledge', { id, byteCount });
}

/**
 * Get the number of pending bytes (written but not acknowledged) for a terminal.
 * Useful for implementing backpressure.
 */
export async function getTerminalPendingBytes(id: string): Promise<number> {
  return invoke<number>('terminal_pending_bytes', { id });
}

/**
 * Emit a prompt event (called when shell integration detects a prompt).
 * This is typically called by the frontend when xterm.js shell integration fires.
 */
export async function emitTerminalPrompt(
  id: string,
  promptType?: 'primary' | 'continuation' | 'secondary'
): Promise<void> {
  return invoke('terminal_emit_prompt', { id, promptType });
}

/**
 * Subscribe to terminal prompt events.
 */
export async function onTerminalPrompt(
  callback: (data: TerminalPromptEvent) => void
): Promise<() => void> {
  return listen<TerminalPromptEvent>('terminal:prompt', callback);
}
