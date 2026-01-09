/**
 * LSP Operations
 *
 * Language Server Protocol functions for code intelligence features.
 */

import { invoke, listen } from './core';

// ============================================
// Types
// ============================================

export interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
}

export interface HoverInfo {
  contents: string;
  range?: Range;
}

export interface Location {
  path: string;
  line: number;
  column: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Position {
  line: number;
  column: number;
}

export interface Diagnostic {
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  range: Range;
  source?: string;
  code?: string;
}

/**
 * Diagnostics event from LSP server (push-based).
 */
export interface DiagnosticsEvent {
  /** File path (absolute) */
  path: string;
  /** Diagnostics for this file */
  diagnostics: Diagnostic[];
  /** Language server that produced these */
  language: string;
}

export interface SignatureHelp {
  signatures: SignatureInfo[];
  activeSignature: number;
  activeParameter: number;
}

export interface SignatureInfo {
  label: string;
  documentation?: string;
  parameters: ParameterInfo[];
}

export interface ParameterInfo {
  label: string;
  documentation?: string;
}

// ============================================
// LSP Operations
// ============================================

export async function lspSetWorkspace(path: string): Promise<void> {
  return invoke('lsp_set_workspace', { path });
}

export async function getCompletions(
  path: string,
  line: number,
  column: number
): Promise<CompletionItem[]> {
  return invoke<CompletionItem[]>('lsp_completions', { path, line, column });
}

export async function getHover(
  path: string,
  line: number,
  column: number
): Promise<HoverInfo | null> {
  return invoke<HoverInfo | null>('lsp_hover', { path, line, column });
}

export async function gotoDefinition(
  path: string,
  line: number,
  column: number
): Promise<Location | null> {
  return invoke<Location | null>('lsp_goto_definition', { path, line, column });
}

export async function findReferences(
  path: string,
  line: number,
  column: number
): Promise<Location[]> {
  return invoke<Location[]>('lsp_find_references', { path, line, column });
}

export async function formatDocument(path: string): Promise<string> {
  return invoke<string>('lsp_format', { path });
}

export async function getDiagnostics(path: string): Promise<Diagnostic[]> {
  return invoke<Diagnostic[]>('lsp_diagnostics', { path });
}

export async function getSignatureHelp(
  path: string,
  line: number,
  column: number
): Promise<SignatureHelp | null> {
  return invoke<SignatureHelp | null>('lsp_signature_help', { path, line, column });
}

export async function lspDidOpen(path: string, language: string, content: string): Promise<void> {
  return invoke('lsp_did_open', { path, language, content });
}

export async function lspDidChange(path: string, content: string, version: number): Promise<void> {
  return invoke('lsp_did_change', { path, content, version });
}

export async function lspDidSave(path: string): Promise<void> {
  return invoke('lsp_did_save', { path });
}

export async function lspDidClose(path: string): Promise<void> {
  return invoke('lsp_did_close', { path });
}

/**
 * Start a language server for the given language.
 * @param language - Language ID (e.g., "rust", "typescript", "python")
 * @param rootPath - Workspace root path
 */
export async function lspStart(language: string, rootPath: string): Promise<void> {
  return invoke('lsp_start', { language, rootPath });
}

/**
 * Stop a language server.
 * @param language - Language ID to stop
 */
export async function lspStop(language: string): Promise<void> {
  return invoke('lsp_stop', { language });
}

/**
 * Check if a language server is running.
 * @param language - Language ID to check
 */
export async function lspIsRunning(language: string): Promise<boolean> {
  return invoke<boolean>('lsp_is_running', { language });
}

/**
 * Get list of running language servers.
 */
export async function lspRunningServers(): Promise<string[]> {
  return invoke<string[]>('lsp_running_servers');
}

/**
 * Subscribe to diagnostics events (push-based).
 *
 * @param callback - Called when diagnostics are received for any file
 * @returns Unsubscribe function
 *
 * @example
 * ```typescript
 * const unlisten = await onDiagnostics((event) => {
 *   console.log(`${event.path}: ${event.diagnostics.length} issues`);
 * });
 *
 * // Later...
 * unlisten();
 * ```
 */
export async function onDiagnostics(
  callback: (event: DiagnosticsEvent) => void
): Promise<() => void> {
  return listen<DiagnosticsEvent>('lsp:diagnostics', callback);
}

/**
 * Subscribe to diagnostics for a specific file.
 *
 * @param filePath - Absolute path to watch
 * @param callback - Called when diagnostics change for this file
 * @returns Unsubscribe function
 */
export async function onFileDiagnostics(
  filePath: string,
  callback: (diagnostics: Diagnostic[]) => void
): Promise<() => void> {
  return listen<DiagnosticsEvent>('lsp:diagnostics', (event): void => {
    // Normalize paths for comparison
    const eventPath = event.path.replace(/\\/g, '/');
    const watchPath = filePath.replace(/\\/g, '/');

    if (eventPath === watchPath) {
      callback(event.diagnostics);
    }
  });
}
