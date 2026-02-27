import { code } from '@streamdown/code';
import { mermaid } from '@streamdown/mermaid';
import { useCallback } from 'react';
import remarkGfm from 'remark-gfm';
import { Streamdown } from 'streamdown';

import type { FC } from 'react';

import { ErrorBoundary } from '@/components/shared';
import { useTauri } from '@/hooks/agent/use-tauri';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';
import { generateUUID } from '@/types/protocol';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx', '.markdown']);

const REMARK_PLUGINS = [remarkGfm];
const STREAMDOWN_PLUGINS = { mermaid, code };
const LINK_SAFETY_DISABLED = { enabled: false } as const;

const MarkdownTable: FC<{ readonly children?: React.ReactNode }> = ({ children }) => (
  <div className="table-wrapper">
    <table>{children}</table>
  </div>
);

const STREAMDOWN_COMPONENTS = { table: MarkdownTable };

function normalizePath(path: string): string {
  const segments = path.split('/');
  const result: string[] = [];

  for (const segment of segments) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      result.pop();
      continue;
    }
    result.push(segment);
  }

  return `/${result.join('/')}`;
}

function getFileDirectory(filePath: string): string {
  const lastSlashIndex = filePath.lastIndexOf('/');
  if (lastSlashIndex < 0) return '';
  return filePath.slice(0, lastSlashIndex);
}

interface MarkdownPreviewProps {
  readonly filePath: string;
  readonly content: string;
  readonly onSwitchToSource: () => void;
}

export const MarkdownPreview: FC<MarkdownPreviewProps> = ({
  filePath,
  content,
  onSwitchToSource,
}) => {
  const { postMessage } = useTauri({});
  const openFile = useFileViewerStore((state) => state.openFile);
  const setLoading = useFileViewerStore((state) => state.setLoading);

  const handleContentClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const anchor = target.closest('a');
      if (!anchor) return;

      const rawHref = anchor.getAttribute('href');
      if (!rawHref) return;

      event.preventDefault();

      if (rawHref.startsWith('#')) {
        const targetId = rawHref.slice(1);
        const escapedId = targetId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const sectionEl = event.currentTarget.querySelector(`[id="${escapedId}"]`);
        sectionEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      try {
        const parsed = new URL(rawHref);
        if (ALLOWED_PROTOCOLS.has(parsed.protocol)) {
          postMessage({
            type: 'url:open',
            uuid: generateUUID(),
            url: rawHref,
          });
        }
        return;
      } catch {
        // Relative URL - continue to local markdown routing.
      }

      const cleanHref = rawHref.split('#')[0]?.split('?')[0] ?? rawHref;
      const extensionMatch = /\.[^.]+$/.exec(cleanHref);
      const extension = extensionMatch?.[0]?.toLowerCase() ?? '';
      if (!MARKDOWN_EXTENSIONS.has(extension)) return;

      const fileDir = getFileDirectory(filePath);
      const resolvedPath = normalizePath(`${fileDir}/${cleanHref}`);

      openFile(resolvedPath);
      setLoading(true, resolvedPath);
      postMessage({
        type: 'file:read',
        uuid: generateUUID(),
        path: resolvedPath,
      });
    },
    [filePath, openFile, postMessage, setLoading]
  );

  return (
    <div className="h-full w-full overflow-auto bg-editor-bg">
      <ErrorBoundary
        fallback={(error, reset) => (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <p className="text-sm">Preview failed to render</p>
            <p className="max-w-md text-center text-xs">{error.message}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={reset}
                className="text-xs underline underline-offset-2 hover:text-foreground"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={onSwitchToSource}
                className="text-xs underline underline-offset-2 hover:text-foreground"
              >
                Switch to source
              </button>
            </div>
          </div>
        )}
      >
        <div className="file-preview chat-markdown" onClick={handleContentClick}>
          <Streamdown
            remarkPlugins={REMARK_PLUGINS}
            plugins={STREAMDOWN_PLUGINS}
            components={STREAMDOWN_COMPONENTS}
            linkSafety={LINK_SAFETY_DISABLED}
            mode="static"
          >
            {content}
          </Streamdown>
        </div>
      </ErrorBoundary>
    </div>
  );
};
