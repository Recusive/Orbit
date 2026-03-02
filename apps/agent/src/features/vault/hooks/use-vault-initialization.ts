import { useEffect } from 'react';

import { useVaultEditorStore, useVaultStore } from '@/features/vault/stores';
import { useUIStore, useVaultOpen } from '@/stores/ui/ui-store';

export function useVaultInitialization(): void {
  const workspacePath = useUIStore((state) => state.workspacePath);
  const vaultOpen = useVaultOpen();
  const initializedWorkspace = useVaultStore((state) => state.initializedWorkspace);
  const initializeVault = useVaultStore((state) => state.initializeVault);
  const clearWorkspaceState = useVaultStore((state) => state.clearWorkspaceState);
  const closeDocument = useVaultEditorStore((state) => state.closeDocument);

  useEffect(() => {
    if (!workspacePath) {
      clearWorkspaceState();
      closeDocument();
      return;
    }

    if (!vaultOpen) return;
    if (initializedWorkspace === workspacePath) return;
    void initializeVault(workspacePath);
  }, [
    workspacePath,
    vaultOpen,
    initializedWorkspace,
    initializeVault,
    clearWorkspaceState,
    closeDocument,
  ]);
}
