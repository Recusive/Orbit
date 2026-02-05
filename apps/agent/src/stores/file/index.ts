/**
 * File stores - File tree and file viewer state
 */

// File store
export { useFileStore, flattenFileTree, useSessionDiffStats } from './file-store';
export type {
  FileChangeType,
  FileChangeStatus,
  FileDiff,
  DiffHunk,
  DiffLine,
  FileChange,
  FileState,
  FlattenedFile,
  SessionDiffStats,
} from './file-store';

// File viewer store
export {
  useFileViewerStore,
  useActiveFile,
  useOpenTabs,
  useHasOpenFiles,
  useFileViewerLoading,
  useCursorPosition,
  getLanguageFromPath,
} from './file-viewer-store';
export type {
  ViewedFileDiff,
  FileViewMode,
  ViewedFile,
  GotoPosition,
  CursorPosition,
} from './file-viewer-store';
