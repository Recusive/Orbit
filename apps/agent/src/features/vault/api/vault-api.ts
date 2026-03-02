import type {
  ProjectDocEntry,
  VaultContent,
  VaultContextConfig,
  VaultEntry,
  VaultListResult,
  VaultSearchResult,
  VaultStats,
  WriteResult,
} from '@/features/vault/types';

import {
  ProjectDocEntrySchema,
  VaultContentSchema,
  VaultContextConfigSchema,
  VaultEntrySchema,
  VaultListResultSchema,
  VaultSearchResultSchema,
  VaultStatsSchema,
  WriteResultSchema,
} from '@/features/vault/types';
import { invoke } from '@/lib/api/core';

export async function vaultCheckInitialized(workspacePath: string): Promise<boolean> {
  return invoke<boolean>('vault_check_initialized', { workspacePath });
}

export async function vaultInitialize(workspacePath: string): Promise<void> {
  await invoke('vault_initialize', { workspacePath });
}

interface ListOptions {
  relativePath?: string | undefined;
  offset?: number | undefined;
  limit?: number | undefined;
}

export async function vaultList(
  workspacePath: string,
  options?: ListOptions
): Promise<VaultListResult> {
  const result = await invoke<unknown>('vault_list', {
    workspacePath,
    relativePath: options?.relativePath,
    offset: options?.offset,
    limit: options?.limit,
  });
  return VaultListResultSchema.parse(result);
}

export async function vaultRead(
  workspacePath: string,
  relativePath: string
): Promise<VaultContent> {
  const result = await invoke<unknown>('vault_read', { workspacePath, relativePath });
  return VaultContentSchema.parse(result);
}

interface WriteOptions {
  expectedModifiedAt?: number | undefined;
  force?: boolean | undefined;
}

export async function vaultWrite(
  workspacePath: string,
  relativePath: string,
  content: string,
  options?: WriteOptions
): Promise<WriteResult> {
  const result = await invoke<unknown>('vault_write', {
    workspacePath,
    relativePath,
    content,
    expectedModifiedAt: options?.expectedModifiedAt,
    force: options?.force,
  });
  return WriteResultSchema.parse(result);
}

export async function vaultCreateDirectory(
  workspacePath: string,
  relativePath: string
): Promise<void> {
  await invoke('vault_create_directory', { workspacePath, relativePath });
}

export async function vaultRename(
  workspacePath: string,
  oldRelativePath: string,
  newName: string
): Promise<void> {
  await invoke('vault_rename', { workspacePath, oldRelativePath, newName });
}

export async function vaultMove(
  workspacePath: string,
  fromRelativePath: string,
  toRelativePath: string
): Promise<void> {
  await invoke('vault_move', { workspacePath, fromRelativePath, toRelativePath });
}

export async function vaultDelete(workspacePath: string, relativePath: string): Promise<void> {
  await invoke('vault_delete', { workspacePath, relativePath });
}

export async function vaultExists(workspacePath: string, relativePath: string): Promise<boolean> {
  return invoke<boolean>('vault_exists', { workspacePath, relativePath });
}

export async function vaultGetMetadata(
  workspacePath: string,
  relativePath: string
): Promise<VaultEntry> {
  const result = await invoke<unknown>('vault_get_metadata', { workspacePath, relativePath });
  return VaultEntrySchema.parse(result);
}

export async function vaultStats(workspacePath: string): Promise<VaultStats> {
  const result = await invoke<unknown>('vault_stats', { workspacePath });
  return VaultStatsSchema.parse(result);
}

export async function vaultGetContextConfig(workspacePath: string): Promise<VaultContextConfig> {
  const result = await invoke<unknown>('vault_get_context_config', { workspacePath });
  return VaultContextConfigSchema.parse(result);
}

export async function vaultSetContextConfig(
  workspacePath: string,
  config: VaultContextConfig
): Promise<VaultContextConfig> {
  const result = await invoke<unknown>('vault_set_context_config', {
    workspacePath,
    config,
  });
  return VaultContextConfigSchema.parse(result);
}

export async function vaultGetContextFiles(workspacePath: string): Promise<string[]> {
  return invoke<string[]>('vault_get_context_files', { workspacePath });
}

interface DiscoverOptions {
  maxDepth?: number | undefined;
  maxResults?: number | undefined;
}

export async function vaultDiscoverProjectDocs(
  workspacePath: string,
  options?: DiscoverOptions
): Promise<ProjectDocEntry[]> {
  const result = await invoke<unknown>('vault_discover_project_docs', {
    workspacePath,
    maxDepth: options?.maxDepth,
    maxResults: options?.maxResults,
  });
  return ProjectDocEntrySchema.array().parse(result);
}

export async function vaultReadProjectDoc(
  workspacePath: string,
  absolutePath: string
): Promise<VaultContent> {
  const result = await invoke<unknown>('vault_read_project_doc', { workspacePath, absolutePath });
  return VaultContentSchema.parse(result);
}

export async function vaultSearchAllDocs(
  workspacePath: string,
  query: string,
  maxResults?: number
): Promise<VaultSearchResult[]> {
  const result = await invoke<unknown>('vault_search_all_docs', {
    workspacePath,
    query,
    maxResults,
  });
  return VaultSearchResultSchema.array().parse(result);
}
