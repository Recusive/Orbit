import { createLogger } from '@orbit/common/lib';
import { preloadHighlighter, registerCustomTheme } from '@pierre/diffs';
import { WorkerPoolContextProvider } from '@pierre/diffs/react';
import pierreDarkTheme from '@pierre/theme/themes/pierre-dark.json';
import pierreLightTheme from '@pierre/theme/themes/pierre-light.json';
import { useEffect, useMemo, useState } from 'react';

import type { SupportedLanguages, ThemeRegistrationResolved } from '@pierre/diffs';
import type { FC, ReactNode } from 'react';

import { PIERRE_THEME } from '@/lib/utils/pierre-adapter';
import { clearParsedDiffCache } from '@/lib/utils/pierre-diff-cache';
import {
  PIERRE_WORKER_POOL_OPTIONS,
  supportsPierreWorkerPool,
} from '@/lib/utils/pierre-worker-factory';
import { useGitStore } from '@/stores/git/git-store';

// ---------------------------------------------------------------------------
// Register Orbit-customized Pierre themes.
// Pierre's registerCustomTheme is "first write wins" — use unique names.
// Static imports avoid WKWebView's broken dynamic import() for JSON.
// ---------------------------------------------------------------------------
const darkBase = pierreDarkTheme as unknown as ThemeRegistrationResolved;
const lightBase = pierreLightTheme as unknown as ThemeRegistrationResolved;

// Orbit themes — sidebar background for all Pierre surfaces.
// Pierre's worker pool only supports one theme set, so both inline cards
// and the diff tab use the same editor.background.
registerCustomTheme('orbit-dark', () =>
  Promise.resolve({
    ...darkBase,
    name: 'orbit-dark',
    colors: { ...darkBase.colors, 'editor.background': '#232323' },
  } as ThemeRegistrationResolved)
);

registerCustomTheme('orbit-light', () =>
  Promise.resolve({
    ...lightBase,
    name: 'orbit-light',
    colors: { ...lightBase.colors, 'editor.background': '#f8f8f8' },
  } as ThemeRegistrationResolved)
);

// Diff tab — chat area background (#181818 dark, #ebebeb light)

// ---------------------------------------------------------------------------

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
  const repoPath = useGitStore((state) => state.repoPath);
  const [workerPoolEnabled, setWorkerPoolEnabled] = useState(false);
  const highlighterOptions = useMemo(
    () => ({
      theme: PIERRE_THEME,
      langs: PRELOAD_LANGUAGES,
      lineDiffType: 'word' as const,
      tokenizeMaxLineLength: 1000,
    }),
    []
  );

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

  useEffect(() => {
    const enabled = supportsPierreWorkerPool();
    setWorkerPoolEnabled(enabled);

    if (!enabled) {
      logger.info('Pierre worker pool unavailable; using main-thread highlighting fallback');
    }
  }, []);

  useEffect(() => {
    clearParsedDiffCache();
  }, [repoPath]);

  if (!workerPoolEnabled) {
    return <>{children}</>;
  }

  return (
    <WorkerPoolContextProvider
      poolOptions={PIERRE_WORKER_POOL_OPTIONS}
      highlighterOptions={highlighterOptions}
    >
      {children}
    </WorkerPoolContextProvider>
  );
};
