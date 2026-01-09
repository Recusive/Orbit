import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { OutlineItem } from '@/components/editor/editor-breadcrumbs';
import type { GotoPosition, ViewedFile } from '@/stores/file/file-viewer-store';
import type { FC } from 'react';

import { EditorBreadcrumbs, EditorSkeleton, extractMarkdownOutline } from '@/components/editor';
import { FileDiffViewer } from '@/components/git';
import { writeFile, lspDidChange, lspDidSave } from '@/lib/api';
import {
  useCursorPosition,
  useFileViewerStore,
  useWordWrap,
} from '@/stores/file/file-viewer-store';

// Lazy load CodeMirror to reduce initial bundle size (~500KB)
const LazyCodeMirrorEditor = lazy(() =>
  import('@/components/editor/CodeMirrorEditor').then((m) => ({ default: m.CodeMirrorEditor }))
);

// Hook to detect theme from DOM
function useDetectTheme(): 'dark' | 'light' {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return (): void => {
      observer.disconnect();
    };
  }, []);

  return theme;
}

interface FileViewerContentProps {
  readonly file: ViewedFile;
}

export const FileViewerContent: FC<FileViewerContentProps> = ({ file }) => {
  const theme = useDetectTheme();
  const cursorPosition = useCursorPosition();
  const wordWrap = useWordWrap();
  const searchOpen = useFileViewerStore((state) => state.searchOpen);
  const updateContent = useFileViewerStore((state) => state.updateContent);
  const markSaved = useFileViewerStore((state) => state.markSaved);
  const pendingGoto = useFileViewerStore((state) => state.pendingGoto);
  const clearPendingGoto = useFileViewerStore((state) => state.clearPendingGoto);
  const gotoPosition = useFileViewerStore((state) => state.gotoPosition);
  const documentVersionRef = useRef(1); // Track document version for LSP

  // Only apply goto if it's for the current file
  const gotoForThisFile: GotoPosition | null = pendingGoto;

  // Extract outline for markdown files
  const outline = useMemo((): OutlineItem[] => {
    if (file.language === 'markdown') {
      return extractMarkdownOutline(file.content);
    }
    return [];
  }, [file.content, file.language]);

  // Find active outline index based on cursor position
  const activeOutlineIndex = useMemo((): number => {
    if (outline.length === 0) return -1;

    // Find the last heading that is at or before the current cursor line
    // cursorPosition.line is 1-indexed, outline.line is 0-indexed
    const cursorLine = cursorPosition.line - 1;
    let activeIndex = -1;

    for (let i = 0; i < outline.length; i++) {
      const item = outline[i];
      if (item && item.line <= cursorLine) {
        activeIndex = i;
      } else if (item) {
        break;
      }
    }

    return activeIndex;
  }, [outline, cursorPosition.line]);

  // Handle outline item click - navigate to that line
  const handleOutlineClick = useCallback(
    (item: OutlineItem): void => {
      gotoPosition(file.path, item.line + 1, 1); // Convert 0-indexed to 1-indexed
    },
    [gotoPosition, file.path]
  );

  // Handle content changes from editor
  const handleChange = useCallback(
    (newContent: string): void => {
      updateContent(file.path, newContent);

      // Notify LSP of document change
      documentVersionRef.current += 1;
      lspDidChange(file.path, newContent, documentVersionRef.current).catch((err: unknown) => {
        console.warn('[FileViewerContent] Failed to notify LSP of change:', err);
      });
    },
    [file.path, updateContent]
  );

  // Handle save (Cmd-S)
  const handleSave = useCallback(async (): Promise<void> => {
    try {
      await writeFile(file.path, file.content);
      markSaved(file.path);

      // Notify LSP of document save
      lspDidSave(file.path).catch((err: unknown) => {
        console.warn('[FileViewerContent] Failed to notify LSP of save:', err);
      });
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  }, [file.path, file.content, markSaved]);

  // Render diff view when in diff mode with diff data
  if (file.viewMode === 'diff' && file.diffData) {
    return <FileDiffViewer diffData={file.diffData} />;
  }

  return (
    <div className="h-full w-full flex flex-col">
      {/* Breadcrumbs */}
      <EditorBreadcrumbs
        filePath={file.path}
        outline={outline}
        activeOutlineIndex={activeOutlineIndex}
        onOutlineClick={handleOutlineClick}
      />

      {/* Editor */}
      <div className="flex-1 relative min-h-0">
        <Suspense fallback={<EditorSkeleton />}>
          <LazyCodeMirrorEditor
            value={file.content}
            language={file.language}
            filePath={file.path}
            onChange={handleChange}
            onSave={handleSave}
            theme={theme}
            gotoPosition={gotoForThisFile}
            onGotoComplete={clearPendingGoto}
            searchOpen={searchOpen}
            wordWrap={wordWrap}
          />
        </Suspense>
      </div>
    </div>
  );
};
