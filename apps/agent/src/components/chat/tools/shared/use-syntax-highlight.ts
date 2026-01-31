/**
 * Shared syntax highlighting utilities for tool widgets.
 *
 * Provides:
 * - Lazy Shiki singleton (shared across all tool widgets)
 * - useIsDarkMode() hook via useSyncExternalStore
 * - useHighlightedTokens() hook for per-line token highlighting
 * - File extension → Shiki language mapping
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Shiki singleton (shared with bash-tool-widget pattern)
// ---------------------------------------------------------------------------

interface ShikiModule {
  codeToTokensBase: (
    code: string,
    options: { lang: string; theme: string }
  ) => Promise<{ content: string; color?: string }[][]>;
  codeToHtml: (code: string, options: { lang: string; theme: string }) => Promise<string>;
}

let shikiPromise: Promise<ShikiModule> | null = null;

export function getShiki(): Promise<ShikiModule> {
  shikiPromise ??= (import('shiki') as Promise<ShikiModule>).catch((error: unknown) => {
    shikiPromise = null;
    throw error;
  });
  return shikiPromise;
}

// ---------------------------------------------------------------------------
// Dark mode detection (useSyncExternalStore — concurrency-safe)
// ---------------------------------------------------------------------------

function subscribeToTheme(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return (): void => {
    observer.disconnect();
  };
}

function getThemeSnapshot(): boolean {
  return document.documentElement.classList.contains('dark');
}

function getServerSnapshot(): boolean {
  return true;
}

export function useIsDarkMode(): boolean {
  return useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerSnapshot);
}

// ---------------------------------------------------------------------------
// File extension → Shiki language mapping
// ---------------------------------------------------------------------------

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mts: 'typescript',
  mjs: 'javascript',
  cts: 'typescript',
  cjs: 'javascript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  rb: 'ruby',
  php: 'php',
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  json: 'json',
  jsonc: 'jsonc',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  svg: 'xml',
  md: 'markdown',
  mdx: 'mdx',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',
  docker: 'dockerfile',
  lua: 'lua',
  vim: 'vim',
  zig: 'zig',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  clj: 'clojure',
  dart: 'dart',
  r: 'r',
  vue: 'vue',
  svelte: 'svelte',
  astro: 'astro',
};

function getLangFromPath(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (!ext) return undefined;
  return EXT_TO_LANG[ext];
}

// ---------------------------------------------------------------------------
// Token type for highlighted lines
// ---------------------------------------------------------------------------

export interface HighlightToken {
  content: string;
  color?: string | undefined;
}

// ---------------------------------------------------------------------------
// useHighlightedTokens hook
// ---------------------------------------------------------------------------

/**
 * Returns per-line token arrays with syntax colors for the given code + filePath.
 * Falls back to plain text (no colors) if Shiki fails or language isn't supported.
 */
export function useHighlightedTokens(
  code: string,
  filePath: string,
  isDarkMode: boolean
): HighlightToken[][] | null {
  const [tokens, setTokens] = useState<HighlightToken[][] | null>(null);

  useEffect(() => {
    let mounted = true;
    const lang = getLangFromPath(filePath);

    // No language detected — skip highlighting
    if (!lang) {
      setTokens(null);
      return;
    }

    const highlight = async (): Promise<void> => {
      try {
        const { codeToTokensBase } = await getShiki();
        const theme = isDarkMode ? 'github-dark' : 'github-light';
        const result = await codeToTokensBase(code, { lang, theme });
        if (mounted) {
          setTokens(result);
        }
      } catch {
        if (mounted) {
          setTokens(null);
        }
      }
    };

    void highlight();

    return () => {
      mounted = false;
    };
  }, [code, filePath, isDarkMode]);

  return tokens;
}
