import { initFileWatcher } from '../use-tauri-file-watcher';

import type { FileEntry } from '@/lib/api';
import type { WebviewMessage } from '@/types/protocol';

import { conversationList, getWorkspacePath, listDirectory, readFile } from '@/lib/api';
import { toConversationSummaries } from '@/lib/mappers';
import { useUIStore } from '@/stores/ui/ui-store';

export async function handleFileTreeRequest(
  message: Extract<WebviewMessage, { type: 'file:tree:request' }>
): Promise<void> {
  try {
    // Get workspace path or use provided path
    let targetPath: string | undefined = message.path;
    if (targetPath === undefined || targetPath === '') {
      const storedPath = await getWorkspacePath();
      if (!storedPath) {
        // ─────────────────────────────────────────────────────────────────────
        // WORKSPACE SANDBOXING (January 2026)
        // ─────────────────────────────────────────────────────────────────────
        // The Rust backend now enforces workspace sandboxing via ensure_workspace_paths()
        // in src-tauri/src/commands/common/files.rs. All file operations MUST be within
        // the workspace directory set via set_workspace_path().
        //
        // Previously this code fell back to homeDir() or '/', but that will now fail
        // with "Workspace path not set" or "PermissionDenied" errors.
        //
        // If you're seeing file listing failures on app startup:
        // 1. Ensure WelcomePage calls setWorkspacePath() before any file operations
        // 2. Check that the user has selected a workspace folder
        // 3. If you need to access paths outside workspace (e.g., ~/.orbit), add them
        //    to an allow-list in the Rust ensure_within_workspace() function
        // ─────────────────────────────────────────────────────────────────────
        window.postMessage(
          {
            type: 'file:tree:response',
            uuid: crypto.randomUUID(),
            request_uuid: message.uuid,
            path: '',
            children: [],
          },
          '*'
        );
        return;
      }
      targetPath = storedPath;
    }

    // Only update UI store workspace on initial load (when no specific path was requested)
    // This prevents subfolder navigation from overwriting the root workspace
    if (message.path === undefined || message.path === '') {
      // Update UI store with workspace path
      // Note: LSP workspace initialization is handled reactively by useLsp hook
      // when it receives rootPath from the file store
      useUIStore.getState().setWorkspace(targetPath);

      // Load conversations for this workspace (Claude Code-style folder isolation)
      conversationList(targetPath)
        .then((conversations) => {
          useUIStore.getState().setConversations(toConversationSummaries(conversations));
        })
        .catch((err: unknown) => {
          console.warn('[Orbit] Failed to load conversations:', err);
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
    if (!storedPath) {
      // No workspace set - return empty list (see WORKSPACE SANDBOXING comment above)
      window.postMessage(
        {
          type: 'file:list:response',
          uuid: crypto.randomUUID(),
          request_uuid: message.uuid,
          files: [],
        },
        '*'
      );
      return;
    }

    // Get all files recursively (flatten the tree)
    // For now, just list the root directory files
    const entries = await listDirectory(storedPath, false);
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
