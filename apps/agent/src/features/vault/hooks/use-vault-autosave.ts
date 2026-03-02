import { useEffect } from 'react';

import { useVaultEditorStore } from '@/features/vault/stores';
import { useUIStore } from '@/stores/ui/ui-store';

const AUTOSAVE_DEBOUNCE_MS = 2000;

export function useVaultAutosave(): void {
  const workspacePath = useUIStore((state) => state.workspacePath);

  const activeDoc = useVaultEditorStore((state) => state.activeDoc);
  const activeDocContent = useVaultEditorStore((state) => state.activeDocContent);
  const isDocModified = useVaultEditorStore((state) => state.isDocModified);
  const isSaving = useVaultEditorStore((state) => state.isSaving);
  const flushPendingContent = useVaultEditorStore((state) => state.flushPendingContent);
  const saveDocument = useVaultEditorStore((state) => state.saveDocument);

  useEffect(() => {
    if (!workspacePath) return;
    if (activeDoc === null || activeDoc.isDir) return;
    if (!isDocModified || isSaving) return;

    const timeoutId = window.setTimeout(() => {
      void saveDocument(workspacePath);
    }, AUTOSAVE_DEBOUNCE_MS);

    return (): void => {
      window.clearTimeout(timeoutId);
    };
  }, [
    workspacePath,
    activeDoc,
    activeDocContent,
    isDocModified,
    isSaving,
    saveDocument,
    flushPendingContent,
  ]);

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent): void => {
      if (!workspacePath) return;

      const isSaveShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's';
      if (!isSaveShortcut) return;

      const target = event.target as HTMLElement | null;
      const inVaultEditor = target?.closest('.vault-editor-shell') !== null;
      if (!inVaultEditor) return;

      event.preventDefault();
      void saveDocument(workspacePath);
    };

    window.addEventListener('keydown', handleSaveShortcut);
    return (): void => {
      window.removeEventListener('keydown', handleSaveShortcut);
    };
  }, [workspacePath, saveDocument]);
}
