import { createLogger } from '@orbit/common/lib';

import { initFileWatcher } from '../use-tauri-file-watcher';

import type { WebviewMessage } from '@/types/protocol';

import {
  buildFileIndex,
  conversationList,
  getWorkspacePath,
  listDirectory,
  readFile,
} from '@/lib/api';
import { toConversationSummaries, toFileNodes } from '@/lib/mappers';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { useUIStore } from '@/stores/ui/ui-store';

const logger = createLogger('FileHandlers');

export async function handleFileTreeRequest(
  message: Extract<WebviewMessage, { type: 'file:tree:request' }>
): Promise<void> {
  try {
    // Get workspace path or use provided path
    let targetPath: string | undefined = message.path;

    // Get current workspace FIRST to compare later
    const initialWorkspace = await getWorkspacePath();

    if (targetPath === undefined || targetPath === '') {
      const storedPath = initialWorkspace;
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
      const uiStore = useUIStore.getState();
      // Only run destructive workspace bootstrap when the workspace actually changes.
      // Root tree refreshes for the same workspace should not wipe worktree/session UI state.
      if (uiStore.workspacePath !== targetPath) {
        // Note: LSP workspace initialization is handled reactively by useLsp hook
        // when it receives rootPath from the file store
        uiStore.initializeWorkspace(targetPath);
      }

      // Load conversations for this workspace (Claude Code-style folder isolation)
      conversationList(targetPath)
        .then((conversations) => {
          useUIStore.getState().setConversations(toConversationSummaries(conversations));
        })
        .catch((err: unknown) => {
          logger.warn('Failed to load conversations', { error: err });
        });

      // Start watching the workspace for file changes (for auto-refresh)
      initFileWatcher(targetPath).catch((err: unknown) => {
        logger.warn('Failed to initialize file watcher', { error: err });
      });

      // Build file index for fuzzy search (@ mentions)
      buildFileIndex(targetPath).catch((err: unknown) => {
        logger.warn('Failed to build file index', { error: err });
      });
    }

    // Check if workspace changed during async operations (stale request protection)
    // This can happen when switching worktrees - a request for the old workspace
    // might still be in flight when the workspace changes. Skip stale requests
    // to avoid "Permission denied" errors.
    const currentWorkspace = await getWorkspacePath();
    if (currentWorkspace && initialWorkspace && initialWorkspace !== currentWorkspace) {
      // Workspace changed while processing - this is a stale request, skip it
      logger.debug('Skipping stale request: workspace changed', {
        from: initialWorkspace,
        to: currentWorkspace,
      });
      return;
    }

    // Show hidden files (dotfiles like .gitignore, .env, .eslintrc) by default
    // Developers need to see these files in a code editor
    const entries = await listDirectory(targetPath, true);
    const children = toFileNodes(entries);

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
    // Tauri invoke rejects with a string (not Error), so handle both cases
    const errorMessage =
      err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
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
    // Close the empty tab that was pre-opened before the read attempt.
    // Without this, clicking a file that fails to read leaves a blank tab.
    useFileViewerStore.getState().closeTab(message.path);

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
