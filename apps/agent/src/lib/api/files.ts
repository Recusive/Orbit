/**
 * File Operations
 *
 * Functions for reading, writing, and managing files and directories.
 */

import { invoke, listen } from './core';

// ============================================
// Types
// ============================================

export interface FileEntry {
  /** Full path to the file */
  path: string;
  /** File name without directory */
  name: string;
  /** Whether this is a directory */
  isDir: boolean;
  /** Whether this is a symbolic link */
  isSymlink: boolean;
  /** Whether this is a hidden file (name starts with dot) */
  isHidden: boolean;
  /** Whether this file is ignored by git (.gitignore) */
  isGitIgnored: boolean;
  /** File size in bytes (undefined for directories) */
  size?: number;
  /** Last modified timestamp (Unix epoch seconds) */
  modified?: number;
}

export interface FileInfo {
  path: string;
  name: string;
  isDir: boolean;
  isFile: boolean;
  size: number;
  modified: number;
  created: number;
  readonly: boolean;
}

export interface FileChangeEvent {
  type: 'created' | 'modified' | 'deleted' | 'renamed';
  path: string;
  newPath?: string;
}

// ============================================
// File Operations
// ============================================

export async function readFile(path: string): Promise<string> {
  return invoke<string>('read_file', { path });
}

export async function readFileBytes(path: string): Promise<number[]> {
  return invoke<number[]>('read_file_bytes', { path });
}

export async function writeFile(path: string, content: string): Promise<void> {
  return invoke('write_file', { path, content });
}

export async function writeFileBytes(path: string, content: number[]): Promise<void> {
  return invoke('write_file_bytes', { path, content });
}

export async function listDirectory(path: string, showHidden?: boolean): Promise<FileEntry[]> {
  return invoke<FileEntry[]>('list_directory', { path, showHidden });
}

export async function createFile(path: string): Promise<void> {
  return invoke('create_file', { path });
}

export async function createDirectory(path: string): Promise<void> {
  return invoke('create_directory', { path });
}

export async function deleteFile(path: string): Promise<void> {
  return invoke('delete_file', { path });
}

export async function renameFile(oldPath: string, newPath: string): Promise<void> {
  return invoke('rename_file', { oldPath, newPath });
}

export async function copyFile(from: string, to: string): Promise<void> {
  return invoke('copy_file', { from, to });
}

export async function revealInFileManager(path: string): Promise<void> {
  return invoke('reveal_in_file_manager', { path });
}

export async function openInDefaultApp(path: string): Promise<void> {
  return invoke('open_in_default_app', { path });
}

export async function fileExists(path: string): Promise<boolean> {
  return invoke<boolean>('file_exists', { path });
}

export async function isDirectory(path: string): Promise<boolean> {
  return invoke<boolean>('is_directory', { path });
}

export async function getFileInfo(path: string): Promise<FileInfo> {
  return invoke<FileInfo>('get_file_info', { path });
}

// ============================================
// File Watcher
// ============================================

export async function watchPath(path: string): Promise<void> {
  return invoke('watch_path', { path });
}

export async function unwatchPath(path: string): Promise<void> {
  return invoke('unwatch_path', { path });
}

export async function onFileChange(
  callback: (event: FileChangeEvent) => void
): Promise<() => void> {
  return listen<FileChangeEvent>('file:change', callback);
}
