import { invoke } from './core';

export interface MarketplaceSkill {
  readonly id: string;
  readonly skillId: string;
  readonly name: string;
  readonly installs: number;
  readonly source: string;
}

export interface MarketplaceInstallResult {
  readonly success: boolean;
  readonly error?: string;
  readonly installedId?: string;
  readonly warnings?: string[];
}

export async function searchMarketplaceSkills(
  query: string,
  limit?: number
): Promise<MarketplaceSkill[]> {
  return invoke<MarketplaceSkill[]>('skills_marketplace_search', { query, limit });
}

export async function installMarketplaceSkill(
  source: string,
  skillId: string,
  scope: 'project' | 'personal',
  workspacePath?: string
): Promise<MarketplaceInstallResult> {
  return invoke<MarketplaceInstallResult>('skills_marketplace_install', {
    source,
    skillId,
    scope,
    workspacePath,
  });
}

export async function getInstalledMarketplaceIds(workspacePath?: string): Promise<string[]> {
  return invoke<string[]>('skills_marketplace_installed', { workspacePath });
}
