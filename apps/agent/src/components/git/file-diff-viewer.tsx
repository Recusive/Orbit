import { FileDiff } from '@pierre/diffs/react';
import { useMemo } from 'react';

import type { ViewedFileDiff } from '@/stores/file/file-viewer-store';
import type { FC } from 'react';

import { useIsDarkMode } from '@/components/chat/tools/shared';
import { useSmoothScroll } from '@/hooks/ui';
import {
  editToolToPierreDiff,
  PIERRE_DIFF_STYLE,
  PIERRE_DIFF_UNSAFE_CSS,
  PIERRE_THEME,
} from '@/lib/utils/pierre-adapter';

export interface FileDiffViewerProps {
  readonly diffData: ViewedFileDiff;
  readonly filePath?: string;
  readonly className?: string;
}

/**
 * Renders diff data in the file viewer context using Pierre's FileDiff.
 * Takes oldContent/newContent from ViewedFileDiff and passes to parseDiffFromFile.
 */
export const FileDiffViewer: FC<FileDiffViewerProps> = ({
  diffData,
  filePath = 'file',
  className = '',
}) => {
  const smoothScrollRef = useSmoothScroll(0.08);
  const isDarkMode = useIsDarkMode();
  const fileDiff = useMemo(
    () => editToolToPierreDiff(filePath, diffData.oldContent, diffData.newContent),
    [filePath, diffData.oldContent, diffData.newContent]
  );

  return (
    <div
      ref={smoothScrollRef}
      className={`h-full overflow-y-auto overscroll-y-contain bg-card ${className}`}
    >
      {fileDiff ? (
        <FileDiff
          fileDiff={fileDiff}
          style={PIERRE_DIFF_STYLE as React.CSSProperties}
          options={{
            theme: PIERRE_THEME,
            themeType: isDarkMode ? 'dark' : 'light',
            diffStyle: 'unified',
            diffIndicators: 'bars',
            lineDiffType: 'word',
            overflow: 'wrap',
            disableFileHeader: true,
            unsafeCSS: PIERRE_DIFF_UNSAFE_CSS,
          }}
        />
      ) : (
        <div className="px-3 py-4 text-xs text-muted-foreground/60">Unable to render diff</div>
      )}
    </div>
  );
};
