import { createLogger } from '@orbit/common/lib';
import { create } from 'zustand';

import type { ContentEncoding, UnifiedDoc } from '@/features/vault/types';

import { vaultRead, vaultReadProjectDoc, vaultWrite } from '@/features/vault/api';
import { writeFile } from '@/lib/api/files';

const logger = createLogger('VaultEditorStore');

export type VaultSaveState = 'idle' | 'saving' | 'saved' | 'conflicted' | 'error';

interface VaultEditorStoreState {
  activeDoc: UnifiedDoc | null;
  activeDocContent: string;
  activeDocEncoding: ContentEncoding;

  isDocLoading: boolean;
  isDocModified: boolean;
  originalContent: string;
  lastModifiedAt: number | null;
  errorMessage: string | null;

  isSaving: boolean;
  saveState: VaultSaveState;
  flushPendingContent: number;

  openDocument: (workspacePath: string, doc: UnifiedDoc) => Promise<void>;
  setActiveDocContent: (content: string) => void;
  setDocModified: (modified: boolean) => void;
  saveDocument: (workspacePath: string, force?: boolean) => Promise<boolean>;
  reloadDocument: (workspacePath: string) => Promise<void>;
  updateActiveDocPath: (oldAbsolutePath: string, newAbsolutePath: string) => void;
  markFlushPendingContent: () => void;
  markExternalConflict: (message?: string) => void;
  clearSaveState: () => void;
  closeDocument: () => void;
}

export const useVaultEditorStore = create<VaultEditorStoreState>()((set, get) => ({
  activeDoc: null,
  activeDocContent: '',
  activeDocEncoding: 'utf8',

  isDocLoading: false,
  isDocModified: false,
  originalContent: '',
  lastModifiedAt: null,
  errorMessage: null,

  isSaving: false,
  saveState: 'idle',
  flushPendingContent: 0,

  openDocument: async (workspacePath, doc): Promise<void> => {
    set({
      activeDoc: doc,
      isDocLoading: true,
      isDocModified: false,
      errorMessage: null,
      saveState: 'idle',
    });

    try {
      const content =
        doc.source === 'vault'
          ? await vaultRead(workspacePath, doc.relativePath)
          : await vaultReadProjectDoc(workspacePath, doc.absolutePath);

      set({
        activeDoc: doc,
        activeDocContent: content.content,
        activeDocEncoding: content.encoding,
        isDocLoading: false,
        isDocModified: false,
        originalContent: content.content,
        lastModifiedAt: doc.modifiedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open document';
      logger.error('Failed to open vault document', error);
      set({
        activeDoc: null,
        activeDocContent: '',
        originalContent: '',
        activeDocEncoding: 'utf8',
        isDocLoading: false,
        isDocModified: false,
        errorMessage: message,
        saveState: 'error',
      });
    }
  },

  setActiveDocContent: (content): void => {
    set({ activeDocContent: content });
  },

  setDocModified: (modified): void => {
    set({ isDocModified: modified });
  },

  saveDocument: async (workspacePath, force = false): Promise<boolean> => {
    const state = get();
    const doc = state.activeDoc;
    if (doc === null || doc.isDir) {
      return true;
    }

    if (!state.isDocModified && !force) {
      return true;
    }

    const contentToSave = state.activeDocContent;
    if (!force && contentToSave === state.originalContent) {
      set({ isDocModified: false, saveState: 'idle' });
      return true;
    }

    const docId = doc.id;
    set({ isSaving: true, saveState: 'saving', errorMessage: null });
    try {
      let modifiedAt = Date.now();
      if (doc.source === 'project') {
        await writeFile(doc.absolutePath, contentToSave);
      } else {
        const result = await vaultWrite(workspacePath, doc.relativePath, contentToSave, {
          expectedModifiedAt: force ? undefined : (state.lastModifiedAt ?? undefined),
          force,
        });
        modifiedAt = result.modifiedAt;
      }

      // Re-read current state — doc or content may have changed during save
      const current = get();
      if (current.activeDoc?.id !== docId) {
        set({ isSaving: false });
        return true;
      }

      set({
        isSaving: false,
        originalContent: contentToSave,
        isDocModified: current.activeDocContent !== contentToSave,
        lastModifiedAt: modifiedAt,
        saveState: 'saved',
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save document';
      const isConflict = message.toLowerCase().includes('changed externally');
      logger.error('Failed to save vault document', error);
      set({
        isSaving: false,
        saveState: isConflict ? 'conflicted' : 'error',
        errorMessage: message,
      });
      return false;
    }
  },

  reloadDocument: async (workspacePath): Promise<void> => {
    const doc = get().activeDoc;
    if (!doc) return;
    await get().openDocument(workspacePath, doc);
  },

  updateActiveDocPath: (oldAbsolutePath, newAbsolutePath): void => {
    const doc = get().activeDoc;
    if (!doc) return;
    if (doc.absolutePath !== oldAbsolutePath) return;

    const segments = newAbsolutePath.replace(/\\/g, '/').split('/');
    const newName = segments[segments.length - 1] ?? doc.name;
    const dotIndex = newName.lastIndexOf('.');
    const newExtension = dotIndex > 0 ? newName.slice(dotIndex + 1).toLowerCase() : null;

    let newRelativePath = doc.relativePath;
    const vaultMarker = '/.orbit/Vault/';
    const vaultIndex = newAbsolutePath.indexOf(vaultMarker);
    if (vaultIndex >= 0) {
      newRelativePath = newAbsolutePath.slice(vaultIndex + vaultMarker.length);
    }

    const newId =
      doc.source === 'vault' ? `vault:${newRelativePath}` : `project:${newAbsolutePath}`;

    set({
      activeDoc: {
        ...doc,
        id: newId,
        name: newName,
        relativePath: newRelativePath,
        absolutePath: newAbsolutePath,
        extension: newExtension,
      },
    });
  },

  markFlushPendingContent: (): void => {
    set((state) => ({
      flushPendingContent: state.flushPendingContent + 1,
    }));
  },

  markExternalConflict: (message): void => {
    set({
      saveState: 'conflicted',
      errorMessage: message ?? 'File changed externally',
    });
  },

  clearSaveState: (): void => {
    set({ saveState: 'idle', errorMessage: null });
  },

  closeDocument: (): void => {
    set({
      activeDoc: null,
      activeDocContent: '',
      activeDocEncoding: 'utf8',
      isDocLoading: false,
      isDocModified: false,
      originalContent: '',
      lastModifiedAt: null,
      errorMessage: null,
      isSaving: false,
      saveState: 'idle',
    });
  },
}));
