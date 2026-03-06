import type { ViewedFile } from '@/stores/file/file-viewer-store';

import { useMarkdownPreview } from '@/stores/file/file-viewer-store';

export const MAX_PREVIEW_LINES = 10_000;

export function useIsPreviewRendered(file: ViewedFile | null): boolean {
  const markdownPreview = useMarkdownPreview(file?.path ?? null);

  if (!file) return false;
  if (file.fileType === 'image') return false;
  if (file.language !== 'markdown') return false;
  if (file.viewMode === 'diff') return false;
  if (!markdownPreview) return false;

  const canRenderPreview = file.content.split('\n').length <= MAX_PREVIEW_LINES;
  return canRenderPreview;
}
