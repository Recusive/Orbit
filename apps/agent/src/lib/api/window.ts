/**
 * Window Operations
 *
 * Functions for dialogs, clipboard, and app info.
 */

import { invoke, IS_TAURI } from './core';

// ============================================
// Types
// ============================================

export interface FileDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
  multiple?: boolean;
  directory?: boolean;
}

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}

// ============================================
// Window Operations
// ============================================

export async function openFileDialog(
  options?: FileDialogOptions
): Promise<string | string[] | null> {
  if (!IS_TAURI) {
    console.warn('[Mock] openFileDialog');
    return null;
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  return open(options);
}

export async function saveFileDialog(options?: SaveDialogOptions): Promise<string | null> {
  if (!IS_TAURI) {
    console.warn('[Mock] saveFileDialog');
    return null;
  }
  const { save } = await import('@tauri-apps/plugin-dialog');
  return save(options);
}

// ============================================
// Clipboard
// ============================================

export async function clipboardRead(): Promise<string> {
  if (!IS_TAURI) {
    return navigator.clipboard.readText();
  }
  const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
  return readText();
}

export async function clipboardWrite(text: string): Promise<void> {
  if (!IS_TAURI) {
    return navigator.clipboard.writeText(text);
  }
  const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
  return writeText(text);
}

// ============================================
// App Info
// ============================================

export async function getAppVersion(): Promise<string> {
  if (!IS_TAURI) {
    return '0.0.0-dev';
  }
  const { getVersion } = await import('@tauri-apps/api/app');
  return getVersion();
}

export async function getWorkspacePath(): Promise<string | null> {
  return invoke<string | null>('get_workspace_path');
}

export async function setWorkspacePath(path: string): Promise<void> {
  return invoke('set_workspace_path', { path });
}
