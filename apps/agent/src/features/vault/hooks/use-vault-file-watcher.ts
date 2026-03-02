import { useEffect, useRef } from 'react';

import { useVaultEditorStore, useVaultStore } from '@/features/vault/stores';
import { onFileChange } from '@/lib/api/files';
import { useUIStore, useVaultOpen } from '@/stores/ui/ui-store';

const REFRESH_DEBOUNCE_MS = 400;

function normalize(path: string): string {
  return path.replace(/\\/g, '/');
}

function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.mdx') || lower.endsWith('.markdown');
}

export function useVaultFileWatcher(): void {
  const workspacePath = useUIStore((state) => state.workspacePath);
  const vaultOpen = useVaultOpen();
  const activeDoc = useVaultEditorStore((state) => state.activeDoc);
  const markExternalConflict = useVaultEditorStore((state) => state.markExternalConflict);
  const loadProjectDocs = useVaultStore((state) => state.loadProjectDocs);
  const loadVaultDirectory = useVaultStore((state) => state.loadVaultDirectory);
  const currentPath = useVaultStore((state) => state.currentPath);

  // Use ref for currentPath to avoid tearing down the watcher on subdirectory navigation
  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;

  useEffect(() => {
    if (!vaultOpen || !workspacePath) return;

    let projectTimeoutId: number | null = null;
    let vaultTimeoutId: number | null = null;
    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    const scheduleProjectDocRefresh = (): void => {
      if (projectTimeoutId !== null) {
        window.clearTimeout(projectTimeoutId);
      }
      projectTimeoutId = window.setTimeout(() => {
        if (isDisposed) return;
        void loadProjectDocs(workspacePath);
      }, REFRESH_DEBOUNCE_MS);
    };

    const scheduleVaultRefresh = (): void => {
      if (vaultTimeoutId !== null) {
        window.clearTimeout(vaultTimeoutId);
      }
      vaultTimeoutId = window.setTimeout(() => {
        if (isDisposed) return;
        void loadVaultDirectory(workspacePath, currentPathRef.current);
      }, REFRESH_DEBOUNCE_MS);
    };

    const normalizedWorkspace = `${normalize(workspacePath)}/`;
    const normalizedVaultDir = `${normalizedWorkspace}.orbit/Vault/`;
    const normalizedActiveDoc = activeDoc ? normalize(activeDoc.absolutePath) : null;

    void onFileChange((event) => {
      const changedPath = normalize(event.path);
      if (!changedPath.startsWith(normalizedWorkspace)) {
        return;
      }

      // Conflict detection applies to ALL file types, not just markdown
      if (normalizedActiveDoc && changedPath === normalizedActiveDoc && event.type === 'modified') {
        markExternalConflict();
      }

      // For directory refresh, check markdown on both old and new paths (rename)
      const pathsToCheck = [changedPath];
      if (event.type === 'renamed' && 'newPath' in event && typeof event.newPath === 'string') {
        pathsToCheck.push(normalize(event.newPath));
      }
      const hasMarkdown = pathsToCheck.some(isMarkdownPath);

      if (!hasMarkdown) {
        return;
      }

      if (event.type === 'created' || event.type === 'deleted' || event.type === 'renamed') {
        scheduleProjectDocRefresh();

        if (changedPath.startsWith(normalizedVaultDir)) {
          scheduleVaultRefresh();
        }
      }
    }).then((dispose) => {
      if (isDisposed) {
        dispose();
        return;
      }
      unlisten = dispose;
    });

    return (): void => {
      isDisposed = true;
      if (projectTimeoutId !== null) {
        window.clearTimeout(projectTimeoutId);
      }
      if (vaultTimeoutId !== null) {
        window.clearTimeout(vaultTimeoutId);
      }
      if (unlisten) {
        unlisten();
      }
    };
  }, [
    vaultOpen,
    workspacePath,
    activeDoc,
    markExternalConflict,
    loadProjectDocs,
    loadVaultDirectory,
  ]);
}
