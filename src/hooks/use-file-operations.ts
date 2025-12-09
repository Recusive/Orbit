import { useCallback } from 'react';

import { useFileStore } from '../stores/file-store';

import { useVSCode } from './use-vscode';

import type { FileChange, FileChangeType } from '../stores/file-store';

export interface UseFileOperationsReturn {
  changedFiles: FileChange[];
  selectedFile: string | null;
  addFileChange: (path: string, type: FileChangeType, content?: { oldContent?: string; newContent?: string }) => string;
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
  const { sendMessage } = useVSCode();

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
    (path: string, type: FileChangeType, content?: { oldContent?: string; newContent?: string }): string => {
      const id = addFileChangeStore({
        path,
        type,
        ...(content?.oldContent && { oldContent: content.oldContent }),
        ...(content?.newContent && { newContent: content.newContent }),
      });

      // Notify VS Code
      sendMessage({
        type: 'file.change',
        path,
        changeType: type,
        timestamp: Date.now(),
      });

      return id;
    },
    [sendMessage, addFileChangeStore]
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
      sendMessage({
        type: 'file.accept',
        path,
        timestamp: Date.now(),
      });
    },
    [sendMessage, acceptFileStore]
  );

  const rejectFile = useCallback(
    (path: string) => {
      rejectFileStore(path);

      // Notify VS Code
      sendMessage({
        type: 'file.reject',
        path,
        timestamp: Date.now(),
      });
    },
    [sendMessage, rejectFileStore]
  );

  const acceptAllFiles = useCallback(() => {
    acceptAllFilesStore();

    // Notify VS Code
    sendMessage({
      type: 'file.acceptAll',
      timestamp: Date.now(),
    });
  }, [sendMessage, acceptAllFilesStore]);

  const rejectAllFiles = useCallback(() => {
    rejectAllFilesStore();

    // Notify VS Code
    sendMessage({
      type: 'file.rejectAll',
      timestamp: Date.now(),
    });
  }, [sendMessage, rejectAllFilesStore]);

  const removeFile = useCallback(
    (path: string) => {
      removeFileStore(path);
    },
    [removeFileStore]
  );

  const clearFiles = useCallback(() => {
    clearFilesStore();
  }, [clearFilesStore]);

  const getSelectedFileContent = useCallback((): { oldContent?: string; newContent?: string } | null => {
    if (!selectedFile) return null;
    const file = changedFiles.find((f) => f.path === selectedFile);
    if (!file) return null;
    const result: { oldContent?: string; newContent?: string } = {};
    if (file.oldContent) result.oldContent = file.oldContent;
    if (file.newContent) result.newContent = file.newContent;
    return result;
  }, [selectedFile, changedFiles]);

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
