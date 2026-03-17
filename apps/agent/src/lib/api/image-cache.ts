import { convertFileSrc } from '@tauri-apps/api/core';

import { invoke } from './core';

export async function cacheImage(
  sessionId: string,
  filename: string,
  mimeType: string,
  base64Data: string
): Promise<string> {
  const filePath = await invoke<string>('cache_image', {
    sessionId,
    filename,
    mimeType,
    base64Data,
  });
  return convertFileSrc(filePath);
}

export function toCachedImagePreviewUrl(previewUrl: string): string {
  if (
    previewUrl.startsWith('asset:') ||
    previewUrl.startsWith('http:') ||
    previewUrl.startsWith('https:') ||
    previewUrl.startsWith('data:')
  ) {
    return previewUrl;
  }

  return convertFileSrc(previewUrl);
}
