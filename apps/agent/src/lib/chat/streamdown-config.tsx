/**
 * Shared Streamdown configuration — used by both MessageItem and the
 * background render service.
 *
 * Keeping plugin/component references identical across both consumers is
 * critical: if the render service uses different plugins or components than
 * MessageItem, cached HTML will differ from live renders and cause layout
 * shifts when TanStack Virtual mounts items.
 *
 * ── Theme Safety ────────────────────────────────────────────────────────
 * Shiki's dual-theme mode (github-light / github-dark) emits CSS custom
 * properties (`--shiki-light`, `--shiki-dark`) on each token span. The
 * active theme is applied via CSS — meaning cached HTML survives theme
 * switches without invalidation.
 * ────────────────────────────────────────────────────────────────────────
 */
import { code as shikiCode } from '@streamdown/code';
import { mermaid } from '@streamdown/mermaid';
import remarkGfm from 'remark-gfm';

import type { CodeHighlighterPlugin } from '@streamdown/code';
import type { FC } from 'react';

import { rehypeFlowTokens } from '@/lib/rehype-flow-tokens';
import { rehypeInsightBlocks } from '@/lib/rehype-insight-blocks';

// ── Link Safety ────────────────────────────────────────────────────────
// Disable Streamdown's built-in link safety modal. Links render as plain
// <a> tags instead of <button> elements, letting our handleContentClick
// route them through onOpenUrl → Tauri.
export const LINK_SAFETY_DISABLED = { enabled: false } as const;

// ── Table Component ────────────────────────────────────────────────────
// Replaces Streamdown's built-in MarkdownTable which hardcodes width and
// border styles. Our component renders a clean <table> inside a wrapper
// div, letting globals.css handle styling (rounded corners, fit-content).
const MarkdownTable: FC<{ readonly children?: React.ReactNode }> = ({ children }) => (
  <div className="table-wrapper">
    <table>{children}</table>
  </div>
);

// ── Stable References ──────────────────────────────────────────────────
// Defined at module level to prevent recreation on each render. Streamdown
// compares plugin/component arrays by reference — recreating them forces
// full re-renders.

export const STREAMDOWN_COMPONENTS = { table: MarkdownTable };

export const REMARK_PLUGINS = [remarkGfm];

// Rehype configuration:
// 1. rehypeInsightBlocks: detects `★ Insight ───` / `───` border patterns
//    and restructures them into styled <aside class="insight-block">.
//    Must run BEFORE rehypeFlowTokens so the DOM is finalized.
// 2. rehypeFlowTokens: wraps text in <span class="flow-token"> for
//    per-word blur-in animation during streaming. Inert when not streaming.

/** Streaming messages: flow tokens enable per-word blur-in animation. */
export const REHYPE_PLUGINS_STREAMING = [rehypeInsightBlocks, rehypeFlowTokens];

/** Completed messages: skip flow tokens — saves ~1ms per segment and 500+ DOM nodes. */
export const REHYPE_PLUGINS_STATIC = [rehypeInsightBlocks];

// ── Code Plugin (Shiki) ────────────────────────────────────────────────
// Wraps the default @streamdown/code plugin to fall back unlabeled code
// blocks (``` with no language) to markdown highlighting instead of
// Shiki's "text" fallback which produces no syntax colors.
const code: CodeHighlighterPlugin = {
  ...shikiCode,
  highlight: (...args: Parameters<typeof shikiCode.highlight>) => {
    const [options, callback] = args;
    const language = shikiCode.supportsLanguage(options.language)
      ? options.language
      : ('markdown' as typeof options.language);
    return shikiCode.highlight({ ...options, language }, callback);
  },
};

export const STREAMDOWN_PLUGINS = { mermaid, code };

/** Time (ms) to wait after last Streamdown layout mutation before considering layout stable. */
export const STREAMDOWN_LAYOUT_STABLE_MS = 250;
