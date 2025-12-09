import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type FileChangeType = 'created' | 'modified' | 'deleted';
export type FileChangeStatus = 'pending' | 'accepted' | 'rejected';

export interface FileDiff {
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'delete' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface FileChange {
  id: string;
  path: string;
  type: FileChangeType;
  status: FileChangeStatus;
  timestamp: number;
  diff?: FileDiff;
  oldContent?: string;
  newContent?: string;
  language?: string;
}

export interface FileState {
  changedFiles: FileChange[];
  selectedFile: string | null;
  filterStatus: FileChangeStatus | 'all';
  // Actions
  addFileChange: (change: Omit<FileChange, 'id' | 'status' | 'timestamp'>) => string;
  updateFileChange: (id: string, updates: Partial<FileChange>) => void;
  selectFile: (path: string | null) => void;
  acceptFile: (path: string) => void;
  rejectFile: (path: string) => void;
  acceptAllFiles: () => void;
  rejectAllFiles: () => void;
  removeFile: (path: string) => void;
  clearFiles: (status?: FileChangeStatus) => void;
  setFilterStatus: (status: FileChangeStatus | 'all') => void;
}

export const useFileStore = create<FileState>()(
  immer((set) => ({
    changedFiles: [],
    selectedFile: null,
    filterStatus: 'all',

    addFileChange: (change: Omit<FileChange, 'id' | 'status' | 'timestamp'>) => {
      const random = Math.random().toString(36);
      const id = `file_${String(Date.now())}_${random.slice(2, 11)}`;

      set((state) => {
        // Check if file already exists, update it instead
        const existingFile = state.changedFiles.find(f => f.path === change.path);

        if (existingFile) {
          // Update existing file
          Object.assign(existingFile, {
            ...change,
            timestamp: Date.now(),
          });
          return;
        }

        // Add new file
        const newChange: FileChange = {
          ...change,
          id,
          status: 'pending',
          timestamp: Date.now(),
        };

        state.changedFiles.push(newChange);

        // Auto-select if it's the first file
        if (state.changedFiles.length === 1) {
          state.selectedFile = change.path;
        }
      });

      return id;
    },

    updateFileChange: (id: string, updates: Partial<FileChange>) =>
      { set((state) => {
        const file = state.changedFiles.find(f => f.id === id);
        if (file) {
          Object.assign(file, updates);
        }
      }); },

    selectFile: (path: string | null) =>
      { set((state) => {
        state.selectedFile = path;
      }); },

    acceptFile: (path: string) =>
      { set((state) => {
        const file = state.changedFiles.find(f => f.path === path);
        if (file) {
          file.status = 'accepted';
        }
      }); },

    rejectFile: (path: string) =>
      { set((state) => {
        const file = state.changedFiles.find(f => f.path === path);
        if (file) {
          file.status = 'rejected';
        }
      }); },

    acceptAllFiles: () =>
      { set((state) => {
        state.changedFiles.forEach(file => {
          if (file.status === 'pending') {
            file.status = 'accepted';
          }
        });
      }); },

    rejectAllFiles: () =>
      { set((state) => {
        state.changedFiles.forEach(file => {
          if (file.status === 'pending') {
            file.status = 'rejected';
          }
        });
      }); },

    removeFile: (path: string) =>
      { set((state) => {
        state.changedFiles = state.changedFiles.filter(f => f.path !== path);

        // Update selection if the removed file was selected
        if (state.selectedFile === path) {
          state.selectedFile = state.changedFiles[0]?.path ?? null;
        }
      }); },

    clearFiles: (status?: FileChangeStatus) =>
      { set((state) => {
        if (status) {
          state.changedFiles = state.changedFiles.filter(f => f.status !== status);
        } else {
          state.changedFiles = [];
        }

        // Update selection if it was cleared
        if (state.selectedFile && !state.changedFiles.find(f => f.path === state.selectedFile)) {
          state.selectedFile = state.changedFiles[0]?.path ?? null;
        }
      }); },

    setFilterStatus: (status: FileChangeStatus | 'all') =>
      { set((state) => {
        state.filterStatus = status;
      }); },
  }))
);
