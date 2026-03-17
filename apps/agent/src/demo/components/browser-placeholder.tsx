/**
 * BrowserPlaceholder — Configurable browser panel for demo mode
 *
 * Reads `?browserUrl=` from URL params to load any website in an iframe,
 * with a toolbar that matches the real browser panel design.
 * Falls back to a static placeholder page when no URL is provided.
 */
import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';
import { useMemo } from 'react';

import type { FC } from 'react';

export const BrowserPlaceholder: FC = () => {
  const browserUrl = useMemo(
    () => new URLSearchParams(window.location.search).get('browserUrl'),
    []
  );

  return (
    <div className="h-full w-full flex flex-col bg-background overflow-hidden">
      {/* ── Toolbar (matches real browser-toolbar.tsx design) ─────────── */}
      <div className="flex items-center gap-1 px-2 bg-chat-area shrink-0" style={{ height: 35 }}>
        {/* Navigation buttons (disabled in demo) */}
        <button
          disabled
          aria-label="Go back"
          className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground/50 cursor-not-allowed"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        <button
          disabled
          aria-label="Go forward"
          className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground/50 cursor-not-allowed"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>

        <button
          disabled
          aria-label="Reload page"
          className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground/50 cursor-not-allowed"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>

        {/* URL bar — matches real browser-toolbar.tsx: plain text input, no icons */}
        <div className="flex-1 mx-2">
          <div className="w-full h-7 px-3 rounded-[9px] bg-lg-control dark:bg-background border-2 border-transparent text-sm flex items-center overflow-hidden">
            {browserUrl ? (
              <span className="text-foreground truncate">{browserUrl}</span>
            ) : (
              <span className="text-lg-text-secondary">Enter URL...</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {browserUrl ? (
          <iframe
            src={browserUrl}
            className="w-full h-full border-none"
            title="Browser preview"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            referrerPolicy="no-referrer"
          />
        ) : (
          <StaticPlaceholder />
        )}
      </div>
    </div>
  );
};

/** Fallback static page when no browserUrl is provided */
const StaticPlaceholder: FC = () => (
  <div className="h-full w-full overflow-y-auto bg-background">
    {/* Navigation */}
    <nav className="flex items-center justify-between border-b border-border/50 px-6 py-3">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-md bg-primary/20" />
        <span className="text-sm font-semibold text-foreground">Acme Corp</span>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>Products</span>
        <span>Pricing</span>
        <span>Docs</span>
        <span>Blog</span>
      </div>
    </nav>

    {/* Hero */}
    <div className="px-6 py-12 text-center">
      <h1 className="text-2xl font-bold text-foreground tracking-tight">Build faster with AI</h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
        Ship production-ready code in minutes, not hours. Powered by the latest foundation models.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <div className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium">
          Get Started
        </div>
        <div className="px-3 py-1.5 rounded-md border border-border/50 text-xs text-foreground">
          View Demo
        </div>
      </div>
    </div>

    {/* Feature cards */}
    <div className="px-6 pb-8 grid grid-cols-3 gap-3">
      {[
        { title: 'AI Autocomplete', desc: 'Context-aware code suggestions' },
        { title: 'Multi-file Edits', desc: 'Refactor across your codebase' },
        { title: 'Built-in Terminal', desc: 'Run and debug from one place' },
      ].map((card) => (
        <div key={card.title} className="rounded-lg border border-border/50 bg-card p-3">
          <div className="h-3 w-3 rounded-sm bg-primary/20 mb-2" />
          <h3 className="text-xs font-medium text-foreground">{card.title}</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">{card.desc}</p>
        </div>
      ))}
    </div>
  </div>
);
