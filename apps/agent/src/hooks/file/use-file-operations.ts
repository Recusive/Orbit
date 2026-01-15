import { createLogger } from '@orbit/common/lib';
import { useCallback } from 'react';

import type { FileChange, FileChangeType } from '@/stores/file/file-store';
import type { FileAccept, FileReject, FileAcceptAll, FileRejectAll } from '@/types/protocol';

import { useTauri } from '@/hooks/agent/use-tauri';
import { useFileStore } from '@/stores/file/file-store';
import { generateUUID } from '@/types/protocol';

const logger = createLogger('FileOperations');

export interface UseFileOperationsReturn {
  changedFiles: FileChange[];
  selectedFile: string | null;
  addFileChange: (
    path: string,
    type: FileChangeType,
    content?: { oldContent?: string; newContent?: string }
  ) => string;
  selectFile: (path: string | null) => void;
  acceptFile: (path: string) => void;
  rejectFile: (path: string) => void;
  acceptAllFiles: () => void;
  rejectAllFiles: () => void;
  removeFile: (path: string) => void;
  clearFiles: () => void;
  getSelectedFileContent: () => { oldContent?: string; newContent?: string } | null;
}

/**
 * Hook for file operations
 * Handles file change management and VS Code communication
 */
export function useFileOperations(): UseFileOperationsReturn {
  const { postMessage } = useTauri();

  const changedFiles = useFileStore((state) => state.changedFiles);
  const selectedFile = useFileStore((state) => state.selectedFile);
  const addFileChangeStore = useFileStore((state) => state.addFileChange);
  const selectFileStore = useFileStore((state) => state.selectFile);
  const acceptFileStore = useFileStore((state) => state.acceptFile);
  const rejectFileStore = useFileStore((state) => state.rejectFile);
  const acceptAllFilesStore = useFileStore((state) => state.acceptAllFiles);
  const rejectAllFilesStore = useFileStore((state) => state.rejectAllFiles);
  const removeFileStore = useFileStore((state) => state.removeFile);
  const clearFilesStore = useFileStore((state) => state.clearFiles);

  const addFileChange = useCallback(
    (
      path: string,
      type: FileChangeType,
      content?: { oldContent?: string; newContent?: string }
    ): string => {
      logger.debug(`File change: ${type}`, { path });
      const id = addFileChangeStore({
        path,
        type,
        ...(content?.oldContent && { oldContent: content.oldContent }),
        ...(content?.newContent && { newContent: content.newContent }),
      });

      return id;
    },
    [addFileChangeStore]
  );

  const selectFile = useCallback(
    (path: string | null) => {
      selectFileStore(path);
    },
    [selectFileStore]
  );

  const acceptFile = useCallback(
    (path: string) => {
      acceptFileStore(path);

      // Notify VS Code
      postMessage({
        type: 'file:accept',
        uuid: generateUUID(),
        path,
      } satisfies FileAccept);
    },
    [postMessage, acceptFileStore]
  );

  const rejectFile = useCallback(
    (path: string) => {
      rejectFileStore(path);

      // Notify VS Code
      postMessage({
        type: 'file:reject',
        uuid: generateUUID(),
        path,
      } satisfies FileReject);
    },
    [postMessage, rejectFileStore]
  );

  const acceptAllFiles = useCallback(() => {
    acceptAllFilesStore();

    // Notify VS Code
    postMessage({
      type: 'file:accept_all',
      uuid: generateUUID(),
    } satisfies FileAcceptAll);
  }, [postMessage, acceptAllFilesStore]);

  const rejectAllFiles = useCallback(() => {
    rejectAllFilesStore();

    // Notify VS Code
    postMessage({
      type: 'file:reject_all',
      uuid: generateUUID(),
    } satisfies FileRejectAll);
  }, [postMessage, rejectAllFilesStore]);

  const removeFile = useCallback(
    (path: string) => {
      removeFileStore(path);
    },
    [removeFileStore]
  );

  const clearFiles = useCallback(() => {
    clearFilesStore();
  }, [clearFilesStore]);

  const getSelectedFileContent = useCallback((): {
    oldContent?: string;
    newContent?: string;
  } | null => {
    if (!selectedFile) return null;
    // O(1) lookup using Map index instead of O(n) find
    const file = useFileStore.getState().getFileByPath(selectedFile);
    if (!file) return null;
    const result: { oldContent?: string; newContent?: string } = {};
    if (file.oldContent) result.oldContent = file.oldContent;
    if (file.newContent) result.newContent = file.newContent;
    return result;
  }, [selectedFile]);

  return {
    changedFiles,
    selectedFile,
    addFileChange,
    selectFile,
    acceptFile,
    rejectFile,
    acceptAllFiles,
    rejectAllFiles,
    removeFile,
    clearFiles,
    getSelectedFileContent,
  };
}
