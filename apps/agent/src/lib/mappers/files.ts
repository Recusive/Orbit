import type { FileEntry } from '@/lib/api';
import type { FileNode } from '@/types/protocol';

/**
 * System entries to hide from the file explorer.
 * Stored in lowercase — matched case-insensitively for macOS/Windows.
 */
export const EXCLUDED_ENTRY_NAMES: ReadonlySet<string> = new Set([
  '.git',
  '.ds_store',
  '.spotlight-v100',
  '.trashes',
  'thumbs.db',
  'desktop.ini',
]);

/**
 * Filter and map raw FileEntry[] from Tauri into FileNode[] for the tree store.
 */
export function toFileNodes(entries: readonly FileEntry[]): FileNode[] {
  return entries
    .filter((entry) => !EXCLUDED_ENTRY_NAMES.has(entry.name.toLowerCase()))
    .map((entry) => ({
      name: entry.name,
      path: entry.path,
      isDirectory: entry.isDir,
      isFile: !entry.isDir,
      isSymlink: entry.isSymlink,
      isGitIgnored: entry.isGitIgnored,
    }));
}
