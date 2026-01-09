import { initFileWatcher } from '../use-tauri-file-watcher';

import type { FileEntry } from '@/lib/api';
import type { WebviewMessage } from '@/types/protocol';

import { listDirectory, readFile, getWorkspacePath, lspSetWorkspace } from '@/lib/api';
import { useUIStore } from '@/stores/ui/ui-store';

export async function handleFileTreeRequest(
  message: Extract<WebviewMessage, { type: 'file:tree:request' }>
): Promise<void> {
  try {
    // Get workspace path or use provided path
    // Default to home directory if no path set
    let targetPath: string | undefined = message.path;
    if (targetPath === undefined || targetPath === '') {
      const storedPath = await getWorkspacePath();
      if (!storedPath) {
        // No workspace path set - try to get home directory
        try {
          const { homeDir } = await import('@tauri-apps/api/path');
          targetPath = await homeDir();
        } catch {
          // Fallback to root if home dir fails
          targetPath = '/';
        }
      } else {
        targetPath = storedPath;
      }
    }

    // Only update UI store workspace on initial load (when no specific path was requested)
    // This prevents subfolder navigation from overwriting the root workspace
    if (message.path === undefined || message.path === '') {
      useUIStore.getState().setWorkspace(targetPath);

      // Set workspace for LSP - this initializes language servers for the workspace
      lspSetWorkspace(targetPath).catch((err: unknown) => {
        console.warn('[Orbit] Failed to set LSP workspace:', err);
      });

      // Start watching the workspace for file changes (for auto-refresh)
      initFileWatcher(targetPath).catch((err: unknown) => {
        console.warn('[Orbit] Failed to initialize file watcher:', err);
      });
    }

    const entries = await listDirectory(targetPath, false);

    // Convert FileEntry to FileNode format
    const children = entries.map((entry: FileEntry) => ({
      name: entry.name,
      path: entry.path,
      isDirectory: entry.isDir,
      isFile: !entry.isDir,
      isSymlink: entry.isSymlink,
    }));

    window.postMessage(
      {
        type: 'file:tree:response',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        path: targetPath,
        children,
      },
      '*'
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    window.postMessage(
      {
        type: 'file:tree:error',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        error: errorMessage,
      },
      '*'
    );
  }
}

export async function handleFileRead(
  message: Extract<WebviewMessage, { type: 'file:read' }>
): Promise<void> {
  try {
    const content = await readFile(message.path);
    window.postMessage(
      {
        type: 'file:content',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        path: message.path,
        content,
      },
      '*'
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to read file';
    window.postMessage(
      {
        type: 'error',
        uuid: crypto.randomUUID(),
        message: errorMessage,
      },
      '*'
    );
  }
}

export async function handleFileListRequest(
  message: Extract<WebviewMessage, { type: 'file:list:request' }>
): Promise<void> {
  try {
    const storedPath = await getWorkspacePath();
    let workspacePath: string;
    if (!storedPath) {
      // No workspace path set - try to get home directory
      try {
        const { homeDir } = await import('@tauri-apps/api/path');
        workspacePath = await homeDir();
      } catch {
        // Fallback to root if home dir fails
        workspacePath = '/';
      }
    } else {
      workspacePath = storedPath;
    }

    // Get all files recursively (flatten the tree)
    // For now, just list the root directory files
    const entries = await listDirectory(workspacePath, false);
    const files = entries
      .filter((entry: FileEntry) => !entry.isDir)
      .map((entry: FileEntry) => ({
        name: entry.name,
        path: entry.path,
      }));

    window.postMessage(
      {
        type: 'file:list:response',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        files,
      },
      '*'
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to list files';
    console.error('[Orbit] File list error:', errorMessage);
    window.postMessage(
      {
        type: 'file:list:response',
        uuid: crypto.randomUUID(),
        request_uuid: message.uuid,
        files: [],
      },
      '*'
    );
  }
}
