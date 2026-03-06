import { createLogger } from '@orbit/common/lib';
import { AlertTriangle, ExternalLink, FileCode, Image as ImageIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ViewedFile } from '@/stores/file/file-viewer-store';
import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { openInDefaultApp } from '@/lib/api';
import { formatFileSize } from '@/lib/utils';

const logger = createLogger('ImagePreview');

interface ImagePreviewProps {
  readonly file: ViewedFile;
  readonly onViewSource: () => Promise<void>;
}

interface ImageDimensions {
  width: number;
  height: number;
}

export const ImagePreview: FC<ImagePreviewProps> = ({ file, onViewSource }) => {
  const fileName = useMemo(() => file.path.split('/').pop() ?? file.path, [file.path]);
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [externalError, setExternalError] = useState<string | null>(null);
  const [isSwitchingToSource, setIsSwitchingToSource] = useState(false);

  useEffect(() => {
    setDimensions(null);
    setLoadError(false);
    setExternalError(null);
    setIsSwitchingToSource(false);
  }, [file.imageData?.assetUrl]);

  const handleOpenExternally = useCallback(async (): Promise<void> => {
    try {
      await openInDefaultApp(file.path);
      setExternalError(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Cannot open file in default app';
      logger.warn('Failed to open image externally', { path: file.path, error: message });
      setExternalError(message);
    }
  }, [file.path]);

  const handleViewAsText = useCallback(async (): Promise<void> => {
    setIsSwitchingToSource(true);
    try {
      await onViewSource();
    } finally {
      setIsSwitchingToSource(false);
    }
  }, [onViewSource]);

  if (!file.imageData) {
    return null;
  }

  const metadata = [
    dimensions ? `${String(dimensions.width)} x ${String(dimensions.height)}` : null,
    formatFileSize(file.imageData.fileSize),
  ].filter((value): value is string => value !== null);

  return (
    <div className="flex h-full w-full flex-col bg-editor-bg">
      <div className="flex items-center justify-between border-b border-divider px-3 py-2 text-xs text-muted-foreground">
        <div className="min-w-0 truncate font-medium text-foreground">{fileName}</div>
        <div className="ml-4 flex shrink-0 items-center gap-3">
          {metadata.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-6"
        style={{
          backgroundImage:
            'linear-gradient(45deg, rgba(127, 127, 127, 0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(127, 127, 127, 0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(127, 127, 127, 0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(127, 127, 127, 0.08) 75%)',
          backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
          backgroundSize: '16px 16px',
        }}
      >
        {loadError ? (
          <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-divider bg-background/95 px-6 py-5 text-center shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Unable to render image preview</p>
              <p className="text-xs text-muted-foreground">
                The file may be corrupt, too large to decode, or outside the allowed asset scope.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  void handleViewAsText();
                }}
                disabled={isSwitchingToSource}
              >
                <FileCode className="mr-1.5 h-4 w-4" />
                {isSwitchingToSource ? 'Opening source...' : 'View as Text'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void handleOpenExternally();
                }}
              >
                <ExternalLink className="mr-1.5 h-4 w-4" />
                Open in Default App
              </Button>
            </div>
            {externalError ? <p className="text-xs text-destructive">{externalError}</p> : null}
          </div>
        ) : (
          <img
            key={file.imageData.assetUrl}
            src={file.imageData.assetUrl}
            alt={fileName}
            className="max-h-full max-w-full object-contain drop-shadow-sm"
            decoding="async"
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              setDimensions({ width: naturalWidth, height: naturalHeight });
              setLoadError(false);
            }}
            onError={() => {
              setLoadError(true);
            }}
          />
        )}
      </div>

      {!loadError ? (
        <div className="border-t border-divider px-3 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" />
            {file.imageData.mimeType}
          </span>
        </div>
      ) : null}
    </div>
  );
};
