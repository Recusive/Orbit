import { createLogger } from '@orbit/common/lib';
import { useMemo } from 'react';
import { create } from 'zustand';

import { useVaultEditorStore } from './vault-editor-store';

import type {
  ProjectDocEntry,
  UnifiedDoc,
  VaultContextConfig,
  VaultEntry,
} from '@/features/vault/types';

import {
  vaultCheckInitialized,
  vaultCreateDirectory,
  vaultDelete,
  vaultDiscoverProjectDocs,
  vaultGetContextConfig,
  vaultInitialize,
  vaultList,
  vaultMove,
  vaultRead,
  vaultRename,
  vaultSetContextConfig,
  vaultWrite,
} from '@/features/vault/api';

const logger = createLogger('VaultStore');

const DEFAULT_PAGE_SIZE = 200;

function toSlashPath(path: string): string {
  return path.replace(/\\/g, '/');
}

function buildVaultAbsolutePath(workspacePath: string, relativePath: string): string {
  const normalizedWorkspace = workspacePath.replace(/[\\/]+$/, '');
  const normalizedRelative = toSlashPath(relativePath).replace(/^\/+/, '');
  return `${normalizedWorkspace}/.orbit/Vault/${normalizedRelative}`;
}

function extensionFromName(name: string): string | null {
  const index = name.lastIndexOf('.');
  if (index <= 0 || index >= name.length - 1) return null;
  return name.slice(index + 1).toLowerCase();
}

export function toVaultDoc(entry: VaultEntry, workspacePath: string): UnifiedDoc {
  return {
    id: `vault:${entry.path}`,
    name: entry.name,
    relativePath: entry.path,
    absolutePath: buildVaultAbsolutePath(workspacePath, entry.path),
    source: 'vault',
    isDir: entry.isDir,
    sizeBytes: entry.sizeBytes,
    modifiedAt: entry.modifiedAt,
    extension: entry.extension,
  };
}

export function toProjectDoc(entry: ProjectDocEntry): UnifiedDoc {
  return {
    id: `project:${entry.path}`,
    name: entry.name,
    relativePath: entry.relativePath,
    absolutePath: entry.path,
    source: 'project',
    isDir: false,
    sizeBytes: entry.sizeBytes,
    modifiedAt: entry.modifiedAt,
    extension: extensionFromName(entry.name),
  };
}

function parentDirectory(path: string): string {
  const normalized = toSlashPath(path).replace(/\/+$/, '');
  if (normalized.length === 0) return '';
  const index = normalized.lastIndexOf('/');
  if (index < 0) return '';
  return normalized.slice(0, index);
}

function buildDuplicatePath(relativePath: string): string {
  const normalized = toSlashPath(relativePath);
  const parent = parentDirectory(normalized);
  const name = normalized.split('/').pop() ?? normalized;
  const dotIndex = name.lastIndexOf('.');
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const ext = dotIndex > 0 ? name.slice(dotIndex) : '';
  const duplicateName = `${base}-copy${ext}`;
  return parent.length > 0 ? `${parent}/${duplicateName}` : duplicateName;
}

interface VaultStoreState {
  workspacePath: string | null;
  initializedWorkspace: string | null;

  vaultEntries: VaultEntry[];
  currentPath: string;
  isVaultLoading: boolean;
  vaultError: string | null;
  totalCount: number;
  hasMore: boolean;

  projectDocs: ProjectDocEntry[];
  isProjectDocsLoading: boolean;
  projectDocsLastRefreshed: number | null;

  contextConfig: VaultContextConfig | null;

  initializeVault: (workspacePath: string) => Promise<void>;
  loadVaultDirectory: (workspacePath: string, path?: string, append?: boolean) => Promise<void>;
  navigateUp: (workspacePath: string) => Promise<void>;
  loadMore: (workspacePath: string) => Promise<void>;
  loadProjectDocs: (workspacePath: string) => Promise<void>;

  loadContextConfig: (workspacePath: string) => Promise<void>;
  togglePathInContext: (workspacePath: string, absolutePath: string) => Promise<void>;
  isPathInContext: (absolutePath: string) => boolean;

  createVaultFile: (
    workspacePath: string,
    relativePath: string,
    initialContent?: string
  ) => Promise<void>;
  createVaultDirectory: (workspacePath: string, relativePath: string) => Promise<void>;
  renameVaultEntry: (
    workspacePath: string,
    oldRelativePath: string,
    newName: string
  ) => Promise<void>;
  moveVaultEntry: (
    workspacePath: string,
    fromRelativePath: string,
    toRelativePath: string
  ) => Promise<void>;
  deleteVaultEntry: (workspacePath: string, relativePath: string) => Promise<void>;
  duplicateVaultEntry: (workspacePath: string, relativePath: string) => Promise<void>;

  clearWorkspaceState: () => void;
}

export const useVaultStore = create<VaultStoreState>()((set, get) => ({
  workspacePath: null,
  initializedWorkspace: null,

  vaultEntries: [],
  currentPath: '',
  isVaultLoading: false,
  vaultError: null,
  totalCount: 0,
  hasMore: false,

  projectDocs: [],
  isProjectDocsLoading: false,
  projectDocsLastRefreshed: null,

  contextConfig: null,

  initializeVault: async (workspacePath): Promise<void> => {
    if (workspacePath.trim().length === 0) return;
    const current = get().initializedWorkspace;
    if (current === workspacePath) return;

    set({
      workspacePath,
      currentPath: '',
      vaultError: null,
    });

    try {
      const initialized = await vaultCheckInitialized(workspacePath);
      if (!initialized) {
        await vaultInitialize(workspacePath);
      }
      await Promise.all([
        get().loadVaultDirectory(workspacePath, ''),
        get().loadProjectDocs(workspacePath),
        get().loadContextConfig(workspacePath),
      ]);
      set({ initializedWorkspace: workspacePath });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize vault';
      logger.error('Failed to initialize vault', error);
      set({ vaultError: message, initializedWorkspace: null });
    }
  },

  loadVaultDirectory: async (workspacePath, path, append = false): Promise<void> => {
    const targetPath = path ?? get().currentPath;
    const offset = append ? get().vaultEntries.length : 0;
    set({ isVaultLoading: true, vaultError: null });
    try {
      const result = await vaultList(workspacePath, {
        relativePath: targetPath,
        offset,
        limit: DEFAULT_PAGE_SIZE,
      });
      const entries = append ? [...get().vaultEntries, ...result.entries] : result.entries;
      set({
        workspacePath,
        currentPath: targetPath,
        vaultEntries: entries,
        totalCount: result.totalCount,
        hasMore: result.hasMore,
        isVaultLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load vault directory';
      logger.error('Failed to load vault directory', error);
      set({ isVaultLoading: false, vaultError: message });
    }
  },

  navigateUp: async (workspacePath): Promise<void> => {
    const parent = parentDirectory(get().currentPath);
    await get().loadVaultDirectory(workspacePath, parent);
  },

  loadMore: async (workspacePath): Promise<void> => {
    if (!get().hasMore || get().isVaultLoading) return;
    await get().loadVaultDirectory(workspacePath, get().currentPath, true);
  },

  loadProjectDocs: async (workspacePath): Promise<void> => {
    set({ isProjectDocsLoading: true });
    try {
      const docs = await vaultDiscoverProjectDocs(workspacePath);
      set({
        projectDocs: docs,
        isProjectDocsLoading: false,
        projectDocsLastRefreshed: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to discover project docs', error);
      set({ isProjectDocsLoading: false });
    }
  },

  loadContextConfig: async (workspacePath): Promise<void> => {
    try {
      const config = await vaultGetContextConfig(workspacePath);
      set({ contextConfig: config });
    } catch (error) {
      logger.error('Failed to load vault context config', error);
      set({ contextConfig: { version: '1.0.0', includedPaths: [] } });
    }
  },

  togglePathInContext: async (workspacePath, absolutePath): Promise<void> => {
    const currentConfig = get().contextConfig ?? { version: '1.0.0', includedPaths: [] };
    const normalized = toSlashPath(absolutePath);
    const includesPath = currentConfig.includedPaths.includes(normalized);
    const nextPaths = includesPath
      ? currentConfig.includedPaths.filter((path) => path !== normalized)
      : [...currentConfig.includedPaths, normalized];

    const saved = await vaultSetContextConfig(workspacePath, {
      version: currentConfig.version,
      includedPaths: nextPaths,
    });
    set({ contextConfig: saved });
  },

  isPathInContext: (absolutePath): boolean => {
    const config = get().contextConfig;
    if (!config) return false;
    return config.includedPaths.includes(toSlashPath(absolutePath));
  },

  createVaultFile: async (workspacePath, relativePath, initialContent = ''): Promise<void> => {
    await vaultWrite(workspacePath, relativePath, initialContent, { force: true });
    await get().loadVaultDirectory(workspacePath, get().currentPath);
  },

  createVaultDirectory: async (workspacePath, relativePath): Promise<void> => {
    await vaultCreateDirectory(workspacePath, relativePath);
    await get().loadVaultDirectory(workspacePath, get().currentPath);
  },

  renameVaultEntry: async (workspacePath, oldRelativePath, newName): Promise<void> => {
    const oldAbsolutePath = buildVaultAbsolutePath(workspacePath, oldRelativePath);
    const normalizedOldRelative = toSlashPath(oldRelativePath);
    const parent = parentDirectory(normalizedOldRelative);
    const newRelativePath = parent.length > 0 ? `${parent}/${newName}` : newName;
    const newAbsolutePath = buildVaultAbsolutePath(workspacePath, newRelativePath);

    useVaultEditorStore.getState().markFlushPendingContent();

    await vaultRename(workspacePath, oldRelativePath, newName);
    useVaultEditorStore.getState().updateActiveDocPath(oldAbsolutePath, newAbsolutePath);

    await Promise.all([
      get().loadVaultDirectory(workspacePath, get().currentPath),
      get().loadContextConfig(workspacePath),
    ]);
  },

  moveVaultEntry: async (workspacePath, fromRelativePath, toRelativePath): Promise<void> => {
    const oldAbsolutePath = buildVaultAbsolutePath(workspacePath, fromRelativePath);
    const newAbsolutePath = buildVaultAbsolutePath(workspacePath, toRelativePath);
    useVaultEditorStore.getState().markFlushPendingContent();

    await vaultMove(workspacePath, fromRelativePath, toRelativePath);
    useVaultEditorStore.getState().updateActiveDocPath(oldAbsolutePath, newAbsolutePath);

    await Promise.all([
      get().loadVaultDirectory(workspacePath, get().currentPath),
      get().loadContextConfig(workspacePath),
    ]);
  },

  deleteVaultEntry: async (workspacePath, relativePath): Promise<void> => {
    const absolutePath = buildVaultAbsolutePath(workspacePath, relativePath);
    useVaultEditorStore.getState().markFlushPendingContent();

    await vaultDelete(workspacePath, relativePath);

    // Re-read state after async op — user may have switched docs
    const currentDoc = useVaultEditorStore.getState().activeDoc;
    if (currentDoc) {
      const isExactMatch = currentDoc.absolutePath === absolutePath;
      const isDescendant = currentDoc.absolutePath.startsWith(`${absolutePath}/`);
      if (isExactMatch || isDescendant) {
        useVaultEditorStore.getState().closeDocument();
      }
    }

    await Promise.all([
      get().loadVaultDirectory(workspacePath, get().currentPath),
      get().loadContextConfig(workspacePath),
    ]);
  },

  duplicateVaultEntry: async (workspacePath, relativePath): Promise<void> => {
    const content = await vaultRead(workspacePath, relativePath);
    if (content.isBinary) return;

    const duplicatePath = buildDuplicatePath(relativePath);
    await vaultWrite(workspacePath, duplicatePath, content.content, { force: true });
    await get().loadVaultDirectory(workspacePath, get().currentPath);
  },

  clearWorkspaceState: (): void => {
    set({
      workspacePath: null,
      initializedWorkspace: null,
      vaultEntries: [],
      currentPath: '',
      isVaultLoading: false,
      vaultError: null,
      totalCount: 0,
      hasMore: false,
      projectDocs: [],
      isProjectDocsLoading: false,
      projectDocsLastRefreshed: null,
      contextConfig: null,
    });
  },
}));

/** Vault notes as UnifiedDoc[] — transforms vaultEntries with workspacePath. */
export function useVaultDocs(): UnifiedDoc[] {
  const workspacePath = useVaultStore((state) => state.workspacePath);
  const vaultEntries = useVaultStore((state) => state.vaultEntries);

  return useMemo(() => {
    if (!workspacePath) return [];
    return vaultEntries.map((entry) => toVaultDoc(entry, workspacePath));
  }, [workspacePath, vaultEntries]);
}

/** Project docs as UnifiedDoc[] — transforms projectDocs entries. */
export function useProjectDocs(): UnifiedDoc[] {
  const projectDocs = useVaultStore((state) => state.projectDocs);

  return useMemo(() => {
    return projectDocs.map(toProjectDoc);
  }, [projectDocs]);
}
