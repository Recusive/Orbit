import { useCallback, useState } from 'react';

import type { ViewedFile } from '@/stores/file/file-viewer-store';

import { readFile } from '@/lib/api';
import { isSvgFile } from '@/lib/utils';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';

interface SvgSourceToggle {
  isSvg: boolean;
  isSourceView: boolean;
  handleViewSource: () => Promise<void>;
  handleViewImage: () => void;
  sourceReadError: string | null;
}

export function useSvgSourceToggle(file: ViewedFile): SvgSourceToggle {
  const [sourceReadError, setSourceReadError] = useState<string | null>(null);

  const isSvg = file.fileType === 'image' && isSvgFile(file.path);
  const isSourceView = file.imageData?.svgSourceView ?? false;

  const handleViewSource = useCallback(async (): Promise<void> => {
    const viewerStore = useFileViewerStore.getState();
    const existingTab = viewerStore.openTabs.find((tab) => tab.path === file.path);
    if (!existingTab) {
      return;
    }

    if (existingTab.content.length > 0) {
      viewerStore.updateImageData(file.path, { svgSourceView: true });
      setSourceReadError(null);
      return;
    }

    const expectedInstanceId = existingTab.instanceId;

    try {
      const content = await readFile(file.path);
      const currentTab = useFileViewerStore
        .getState()
        .openTabs.find((tab) => tab.path === file.path);
      if (currentTab?.instanceId !== expectedInstanceId) {
        return;
      }

      viewerStore.setFileContent(file.path, content, file.language);
      viewerStore.updateImageData(file.path, { svgSourceView: true });
      setSourceReadError(null);
    } catch (error) {
      setSourceReadError(error instanceof Error ? error.message : String(error));
    }
  }, [file.language, file.path]);

  const handleViewImage = useCallback((): void => {
    const viewerStore = useFileViewerStore.getState();
    const tab = viewerStore.openTabs.find((currentTab) => currentTab.path === file.path);

    viewerStore.closeSearch();

    if (tab && !tab.isModified && file.imageData) {
      const assetUrlBase = file.imageData.assetUrl.split('?')[0] ?? file.imageData.assetUrl;
      const nextAssetUrl = `${assetUrlBase}?t=${String(Date.now())}`;
      viewerStore.updateImageData(file.path, {
        svgSourceView: false,
        assetUrl: nextAssetUrl,
      });
      return;
    }

    viewerStore.updateImageData(file.path, { svgSourceView: false });
  }, [file.imageData, file.path]);

  return { isSvg, isSourceView, handleViewSource, handleViewImage, sourceReadError };
}
