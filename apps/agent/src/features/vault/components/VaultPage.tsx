import { FileText } from 'lucide-react';
import { lazy, Suspense, useCallback, useRef } from 'react';

import { VaultFormatToolbar } from './VaultFormatToolbar';

import type { VaultEditorHandle } from './VaultCrepeEditor';
import type { FC } from 'react';

import { useVaultAutosave, useVaultFileWatcher } from '@/features/vault/hooks';
import { useVaultEditorStore } from '@/features/vault/stores';

const LazyVaultEditor = lazy(() =>
  import('./VaultCrepeEditor').then((module) => ({ default: module.VaultCrepeEditor }))
);

export const VaultPage: FC = () => {
  useVaultAutosave();
  useVaultFileWatcher();

  const activeDoc = useVaultEditorStore((state) => state.activeDoc);
  const activeDocContent = useVaultEditorStore((state) => state.activeDocContent);
  const activeDocEncoding = useVaultEditorStore((state) => state.activeDocEncoding);
  const isDocLoading = useVaultEditorStore((state) => state.isDocLoading);
  const setActiveDocContent = useVaultEditorStore((state) => state.setActiveDocContent);
  const setDocModified = useVaultEditorStore((state) => state.setDocModified);
  const clearSaveState = useVaultEditorStore((state) => state.clearSaveState);

  const editorRef = useRef<VaultEditorHandle>(null);

  const handleFormatCommand = useCallback((command: string, payload?: unknown): void => {
    editorRef.current?.runCommand(command, payload);
  }, []);

  const handleMarkdownChange = useCallback(
    (markdown: string): void => {
      setActiveDocContent(markdown);
      setDocModified(true);
      clearSaveState();
    },
    [setActiveDocContent, setDocModified, clearSaveState]
  );

  const isUtf8Doc = activeDoc !== null && activeDocEncoding === 'utf8';
  const canEditAsMarkdown = activeDoc !== null && !activeDoc.isDir && isUtf8Doc;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {canEditAsMarkdown ? <VaultFormatToolbar onCommand={handleFormatCommand} /> : null}

      <div className="flex-1 min-h-0">
        {activeDoc ? (
          isDocLoading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Loading document...
            </div>
          ) : canEditAsMarkdown ? (
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Loading editor...
                </div>
              }
            >
              <LazyVaultEditor
                ref={editorRef}
                key={activeDoc.id}
                initialContent={activeDocContent}
                readOnly={false}
                onMarkdownChange={handleMarkdownChange}
                onDirtyChange={() => {
                  setDocModified(true);
                }}
              />
            </Suspense>
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <FileText className="h-8 w-8" />
              <p className="text-sm">Binary file — cannot edit as markdown.</p>
            </div>
          )
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <FileText className="h-8 w-8" />
            <p className="text-sm">Select a note from the sidebar to start editing.</p>
          </div>
        )}
      </div>
    </div>
  );
};
