/**
 * Pierre Diffs Provider (placeholder)
 *
 * Pierre's WorkerPoolContextProvider enables off-main-thread syntax highlighting
 * via Web Workers. However, Tauri's WKWebView may not support Worker construction
 * from module URLs reliably. Pierre falls back to main-thread highlighting when
 * no WorkerPoolContextProvider is present.
 *
 * This pass-through provider exists so that adding the worker pool later is a
 * single-file change — just swap children for WorkerPoolContextProvider wrapping.
 */
import { createLogger } from '@orbit/common/lib';
import { preloadHighlighter } from '@pierre/diffs';
import { useEffect } from 'react';

import type { SupportedLanguages } from '@pierre/diffs';
import type { FC, ReactNode } from 'react';

import { PIERRE_THEME } from '@/lib/utils/pierre-adapter';

interface PierreProviderProps {
  readonly children: ReactNode;
}

const logger = createLogger('PierreProvider');

const PRELOAD_LANGUAGES: SupportedLanguages[] = [
  'text',
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'json',
  'markdown',
  'html',
  'css',
  'python',
  'rust',
  'go',
];

export const PierreProvider: FC<PierreProviderProps> = ({ children }) => {
  useEffect(() => {
    let isMounted = true;

    void preloadHighlighter({
      themes: [PIERRE_THEME.light, PIERRE_THEME.dark],
      langs: PRELOAD_LANGUAGES,
    }).catch((error: unknown) => {
      if (!isMounted) return;

      logger.warn('Failed to preload Pierre highlighter; falling back to lazy highlight', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return (): void => {
      isMounted = false;
    };
  }, []);

  // No WorkerPoolContextProvider for now — Pierre renders on main thread.
  // To enable workers later:
  //   import { WorkerPoolContextProvider } from '@pierre/diffs/react';
  //   const workerFactory = () => new Worker(
  //     new URL('@pierre/diffs/worker/worker.js', import.meta.url),
  //     { type: 'module' }
  //   );
  //   return <WorkerPoolContextProvider poolOptions={{ workerFactory }} highlighterOptions={{}}>{children}</WorkerPoolContextProvider>;
  return <>{children}</>;
};
