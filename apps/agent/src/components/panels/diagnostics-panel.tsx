import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Info,
  Lightbulb,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import type { Diagnostic } from '@/lib/api';
import type { FC } from 'react';

import { useDiagnostics } from '@/hooks/lsp/use-diagnostics';
import { useSmoothScroll } from '@/hooks/ui';
import { cn } from '@/lib/utils';

interface DiagnosticsPanelProps {
  /** Called when a diagnostic is clicked (can be async) */
  onDiagnosticClick?: (path: string, diagnostic: Diagnostic) => void | Promise<void>;
  /** Additional CSS classes */
  className?: string;
}

const SEVERITY_ICONS: Record<Diagnostic['severity'], FC<{ className?: string }>> = {
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  hint: Lightbulb,
};

const SEVERITY_COLORS: Record<Diagnostic['severity'], string> = {
  error: 'text-red-400',
  warning: 'text-yellow-400',
  info: 'text-blue-400',
  hint: 'text-gray-400',
};

/**
 * Panel displaying all diagnostics from LSP servers.
 *
 * Shows diagnostics grouped by file with counts for errors and warnings.
 *
 * @example
 * ```tsx
 * <DiagnosticsPanel
 *   onDiagnosticClick={(path, diag) => {
 *     openFile(path, diag.range.start.line);
 *   }}
 * />
 * ```
 */
export const DiagnosticsPanel: FC<DiagnosticsPanelProps> = ({ onDiagnosticClick, className }) => {
  const smoothScrollRef = useSmoothScroll(0.08);
  const { diagnostics, totalErrors, totalWarnings, totalIssues } = useDiagnostics();
  // Use function initializer to avoid creating new Set on every render
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => new Set());

  const toggleFile = useCallback((path: string): void => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Memoize the sorted entries to avoid recomputation on every render
  const allEntries = useMemo(
    () =>
      Object.entries(diagnostics)
        .filter(([, diags]) => diags.length > 0)
        .sort(([a], [b]) => a.localeCompare(b)),
    [diagnostics]
  );

  const getFileName = (path: string): string => {
    return path.split('/').pop() ?? path;
  };

  const getFileDirectory = (path: string): string => {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/');
  };

  return (
    <div className={cn('flex flex-col h-full bg-background text-foreground', className)}>
      {/* Header */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-border">
        <span className="font-medium text-sm">Problems</span>
        {totalErrors > 0 ? (
          <span className="flex items-center gap-1 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5" />
            {totalErrors}
          </span>
        ) : null}
        {totalWarnings > 0 ? (
          <span className="flex items-center gap-1 text-xs text-yellow-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {totalWarnings}
          </span>
        ) : null}
      </div>

      {/* Content */}
      <div ref={smoothScrollRef} className="flex-1 overflow-auto overscroll-y-contain">
        {totalIssues === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            No problems detected
          </div>
        ) : (
          allEntries.map(([path, diags]) => {
            const isExpanded = expandedFiles.has(path);
            const fileErrors = diags.filter((d) => d.severity === 'error').length;
            const fileWarnings = diags.filter((d) => d.severity === 'warning').length;

            return (
              <div key={path} className="border-b border-lg-separator last:border-b-0">
                {/* File header */}
                <button
                  onClick={(): void => {
                    toggleFile(path);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-lg-control-hover text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm truncate">{getFileName(path)}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {getFileDirectory(path)}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    {fileErrors > 0 ? (
                      <span className="text-xs text-red-400">{fileErrors}</span>
                    ) : null}
                    {fileWarnings > 0 ? (
                      <span className="text-xs text-yellow-400">{fileWarnings}</span>
                    ) : null}
                  </div>
                </button>

                {/* Diagnostics list */}
                {isExpanded ? (
                  <div className="pl-6">
                    {diags.map((diag, idx) => {
                      const Icon = SEVERITY_ICONS[diag.severity];
                      const colorClass = SEVERITY_COLORS[diag.severity];

                      return (
                        <button
                          key={`${path}-${String(idx)}`}
                          onClick={(): void => {
                            void onDiagnosticClick?.(path, diag);
                          }}
                          className="w-full flex items-start gap-2 px-3 py-1 hover:bg-lg-control-hover text-left"
                        >
                          <Icon className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', colorClass)} />
                          <span className={cn('text-xs shrink-0', colorClass)}>
                            [{diag.range.start.line + 1}:{diag.range.start.column + 1}]
                          </span>
                          <span className="text-sm flex-1 break-words">{diag.message}</span>
                          {diag.source ? (
                            <span className="text-xs text-muted-foreground shrink-0">
                              {diag.source}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
