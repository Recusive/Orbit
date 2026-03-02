import { useCallback } from 'react';

import type { ContextItem } from '@/types/agent/context';

import { useVaultEditorStore } from '@/features/vault/stores';
import { usePendingContextStore } from '@/stores/chat/pending-context-store';
import { useUIStore } from '@/stores/ui/ui-store';

interface UseVaultContextManagerResult {
  sendActiveDocToAgent: () => Promise<boolean>;
}

export function useVaultContextManager(): UseVaultContextManagerResult {
  const workspacePath = useUIStore((state) => state.workspacePath);
  const setVaultOpen = useUIStore((state) => state.setVaultOpen);

  const sendActiveDocToAgent = useCallback(async (): Promise<boolean> => {
    if (!workspacePath) return false;

    const editorState = useVaultEditorStore.getState();
    const activeDoc = editorState.activeDoc;
    if (!activeDoc || activeDoc.isDir) return false;
    if (editorState.activeDocEncoding !== 'utf8') return false;

    if (editorState.isDocModified) {
      const saved = await editorState.saveDocument(workspacePath);
      if (!saved) return false;
    }

    const contextItem: ContextItem = {
      id: crypto.randomUUID(),
      type: 'file',
      name: activeDoc.name,
      path: activeDoc.absolutePath,
      content: editorState.activeDocContent,
      language: 'markdown',
    };

    usePendingContextStore.getState().enqueueContext(contextItem);
    setVaultOpen(false);
    return true;
  }, [workspacePath, setVaultOpen]);

  return { sendActiveDocToAgent };
}
