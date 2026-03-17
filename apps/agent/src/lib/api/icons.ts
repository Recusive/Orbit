/**
 * App icon operations (macOS only).
 */

import { convertFileSrc } from '@tauri-apps/api/core';

import { invoke } from './core';

/** Raw shape returned by Rust (absolute file path for preview). */
interface RawAppIconInfo {
  readonly id: string;
  readonly name: string;
  readonly theme: string;
  readonly isDefault: boolean;
  readonly isActive: boolean;
  readonly previewPath: string;
}

/** Frontend-facing icon info with an asset URL for the preview image. */
export interface AppIconInfo {
  readonly id: string;
  readonly name: string;
  readonly theme: string;
  readonly isDefault: boolean;
  readonly isActive: boolean;
  readonly previewUrl: string;
}

export async function listAppIcons(): Promise<AppIconInfo[]> {
  const raw = await invoke<RawAppIconInfo[]>('list_app_icons');
  return raw.map((icon) => ({
    id: icon.id,
    name: icon.name,
    theme: icon.theme,
    isDefault: icon.isDefault,
    isActive: icon.isActive,
    previewUrl: convertFileSrc(icon.previewPath),
  }));
}

export async function setAppIcon(id: string): Promise<void> {
  return invoke('set_app_icon', { id });
}
