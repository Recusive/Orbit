import { useCallback, useEffect, useRef, useState } from 'react';

import type { ViewedFile } from '@/stores/file-viewer-store';
import type { FC } from 'react';

import { FileDiffViewer } from '@/components/activity/file-diff-viewer';
import { CodeMirrorEditor } from '@/components/editor/CodeMirrorEditor';
import { writeFile } from '@/lib/backend';
import { useFileViewerStore } from '@/stores/file-viewer-store';

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

    return (): void => { observer.disconnect(); };
  }, []);

  return theme;
}

interface FileViewerContentProps {
  readonly file: ViewedFile;
}

export const FileViewerContent: FC<FileViewerContentProps> = ({ file }) => {
  const theme = useDetectTheme();
  const searchOpen = useFileViewerStore((state) => state.searchOpen);
  const searchQuery = useFileViewerStore((state) => state.searchQuery);
  const setSearchQuery = useFileViewerStore((state) => state.setSearchQuery);
  const closeSearch = useFileViewerStore((state) => state.closeSearch);
  const updateContent = useFileViewerStore((state) => state.updateContent);
  const markSaved = useFileViewerStore((state) => state.markSaved);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [searchOpen]);

  // Handle content changes from editor
  const handleChange = useCallback(
    (newContent: string): void => {
      updateContent(file.path, newContent);
    },
    [file.path, updateContent],
  );

  // Handle save (Cmd-S)
  const handleSave = useCallback(async (): Promise<void> => {
    try {
      await writeFile(file.path, file.content);
      markSaved(file.path);
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  }, [file.path, file.content, markSaved]);

  // Render diff view when in diff mode with diff data
  if (file.viewMode === 'diff' && file.diffData) {
    return <FileDiffViewer diffData={file.diffData} />;
  }

  return (
    <div className="h-full w-full relative">
      <CodeMirrorEditor
        value={file.content}
        language={file.language}
        filePath={file.path}
        onChange={handleChange}
        onSave={handleSave}
        theme={theme}
      />

      {/* Search overlay */}
      {searchOpen ? (
        <div className="absolute top-2 right-4 flex items-center gap-2 bg-card border border-border rounded-md px-2 py-1 shadow-lg z-10">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e): void => {
              setSearchQuery(e.target.value);
            }}
            onKeyDown={(e): void => {
              if (e.key === 'Escape') closeSearch();
            }}
            placeholder="Search..."
            className="w-48 text-sm bg-transparent border-none outline-none"
          />
          <span className="text-xs text-muted-foreground">
            {searchQuery.length > 0 ? 'Esc to close' : ''}
          </span>
        </div>
      ) : null}
    </div>
  );
};
