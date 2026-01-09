/**
 * Settings Operations
 *
 * Functions for managing application settings, SSH hosts, and diagnostics.
 */

import { invoke } from './core';

// ============================================
// Types
// ============================================

export interface EditorSettings {
  fontFamily: string;
  fontSize: number;
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: boolean;
  lineNumbers: boolean;
  minimap: boolean;
  vimMode: boolean;
}

export interface ThemeSettings {
  theme: string;
  accentColor?: string;
}

export interface AISettings {
  enabled: boolean;
  inlineSuggestions: boolean;
}

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

export interface Settings {
  editor: EditorSettings;
  theme: ThemeSettings;
  ai: AISettings;
  windowState: WindowState;
  recentProjects: string[];
}

// ============================================
// Settings Operations
// ============================================

export async function getSettings(): Promise<Settings> {
  return invoke<Settings>('get_settings');
}

export async function updateSettings(settings: Settings): Promise<void> {
  return invoke('update_settings', { settings });
}

export async function addRecentProject(path: string): Promise<void> {
  return invoke('add_recent_project', { path });
}

export async function getRecentProjects(): Promise<string[]> {
  return invoke<string[]>('get_recent_projects');
}

export async function clearRecentProjects(): Promise<void> {
  return invoke('clear_recent_projects');
}

export async function getSettingsPath(): Promise<string> {
  return invoke<string>('get_settings_path');
}

// ============================================
// SSH Host Operations
// ============================================

/**
 * Add an SSH host to the recent hosts list.
 *
 * The host string should be in the format "user@hostname" or "user@hostname:port".
 * The host is moved to the front if it already exists.
 */
export async function addSshHost(host: string): Promise<void> {
  return invoke('add_ssh_host', { host });
}

/**
 * Get the list of recent SSH hosts.
 *
 * Returns an array of host strings, most recent first.
 */
export async function getSshHosts(): Promise<string[]> {
  return invoke<string[]>('get_ssh_hosts');
}

/**
 * Remove an SSH host from the recent hosts list.
 */
export async function removeSshHost(host: string): Promise<void> {
  return invoke('remove_ssh_host', { host });
}

/**
 * Clear all SSH hosts from the recent hosts list.
 */
export async function clearSshHosts(): Promise<void> {
  return invoke('clear_ssh_hosts');
}

// ============================================
// Diagnostics Operations
// ============================================

/**
 * Check if the previous session crashed.
 *
 * Returns the crash log contents if there was a crash, or null if
 * the previous session ended normally.
 *
 * The crash log is consumed (cleared) after reading, so subsequent calls
 * will return null until another crash occurs.
 */
export async function checkPreviousCrash(): Promise<string | null> {
  return invoke<string | null>('check_previous_crash');
}

/**
 * Clear any pending crash logs without reading them.
 *
 * This is useful when the user dismisses a crash notification without
 * viewing the details.
 *
 * Returns true if the log was cleared successfully.
 */
export async function clearCrashLog(): Promise<boolean> {
  return invoke<boolean>('clear_crash_log');
}

/**
 * Get the path to the crash log directory.
 *
 * Returns null if the directory cannot be determined.
 */
export async function getCrashLogPath(): Promise<string | null> {
  return invoke<string | null>('get_crash_log_path');
}
