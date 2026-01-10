/**
 * Performance Dashboard - Debug overlay for monitoring backend performance
 *
 * DEV-ONLY: This component only renders in development mode.
 * Toggle with Ctrl+Shift+P (or Cmd+Shift+P on Mac)
 */

import { RefreshCw, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { OperationRecord, PerformanceAnalysis, SourceSummary } from '@/lib/api';
import type { FC } from 'react';

import { analyzePerformance, clearPerfLog } from '@/lib/api';
import { cn } from '@/lib/utils/utils';

// ============================================
// Dev Mode Check (evaluated once at module load)
// ============================================

const IS_DEV = ((): boolean => {
  try {
    // eslint-disable-next-line @typescript-eslint/dot-notation -- Vite env access pattern
    const mode = import.meta.env['MODE'] as string | undefined;
    return mode === 'development';
  } catch {
    return true;
  }
})();

// ============================================
// Types
// ============================================

interface PerfDashboardProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

// ============================================
// Source Colors
// ============================================

const SOURCE_COLORS: Record<string, string> = {
  IPC: 'bg-blue-500',
  GIT: 'bg-green-500',
  SIDECAR: 'bg-purple-500',
  FS: 'bg-yellow-500',
  TERMINAL: 'bg-orange-500',
  LSP: 'bg-cyan-500',
  SEARCH: 'bg-pink-500',
  CANVAS: 'bg-indigo-500',
  AI: 'bg-rose-500',
  OTHER: 'bg-gray-500',
};

// ============================================
// Sub-components
// ============================================

/**
 * Simple horizontal bar chart for visualizing average times by source
 */
const BarChart: FC<{ data: Record<string, SourceSummary> }> = ({ data }) => {
  const entries = useMemo(() => {
    return Object.entries(data)
      .sort(([, a], [, b]) => b.avg_ms - a.avg_ms)
      .slice(0, 8); // Top 8 sources
  }, [data]);

  const maxAvg = useMemo(() => {
    return Math.max(...entries.map(([, s]) => s.avg_ms), 1);
  }, [entries]);

  if (entries.length === 0) {
    return <div className="text-xs text-muted-foreground">No data yet</div>;
  }

  return (
    <div className="space-y-1.5">
      {entries.map(([source, summary]) => {
        const widthPercent = (summary.avg_ms / maxAvg) * 100;
        const barColor = SOURCE_COLORS[source] ?? 'bg-gray-500';

        return (
          <div key={source} className="flex items-center gap-2">
            <span className="w-16 text-xs font-mono truncate">{source}</span>
            <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
              <div
                className={cn('h-full rounded transition-all', barColor)}
                style={{ width: `${String(Math.max(widthPercent, 2))}%` }}
              />
            </div>
            <span className="w-16 text-xs text-right font-mono">{summary.avg_ms.toFixed(1)}ms</span>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Summary table showing statistics by source
 */
const SummaryTable: FC<{ data: Record<string, SourceSummary> }> = ({ data }) => {
  const entries = useMemo(() => {
    return Object.entries(data).sort(([, a], [, b]) => b.total_ms - a.total_ms);
  }, [data]);

  if (entries.length === 0) {
    return <div className="text-xs text-muted-foreground">No operations recorded</div>;
  }

  return (
    <div className="overflow-auto max-h-32">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border">
            <th className="text-left py-1 font-medium">Source</th>
            <th className="text-right py-1 font-medium">Count</th>
            <th className="text-right py-1 font-medium">Avg</th>
            <th className="text-right py-1 font-medium">Max</th>
            <th className="text-right py-1 font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([source, s]) => (
            <tr key={source} className="border-b border-border/50 hover:bg-muted/50">
              <td className="py-1 font-mono">{source}</td>
              <td className="text-right py-1 font-mono">{s.count}</td>
              <td className="text-right py-1 font-mono">{s.avg_ms.toFixed(1)}ms</td>
              <td className={cn('text-right py-1 font-mono', s.max_ms > 500 && 'text-red-400')}>
                {s.max_ms}ms
              </td>
              <td className="text-right py-1 font-mono">{(s.total_ms / 1000).toFixed(2)}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/**
 * List of bottleneck operations (>500ms)
 */
const BottlenecksList: FC<{ operations: readonly OperationRecord[] }> = ({ operations }) => {
  if (operations.length === 0) {
    return <div className="text-xs text-green-400">No bottlenecks detected!</div>;
  }

  return (
    <div className="space-y-1 max-h-24 overflow-auto">
      {operations.slice(0, 10).map((op, idx) => (
        <div
          key={`${String(op.timestamp)}-${String(idx)}`}
          className="flex items-center gap-2 text-xs bg-red-500/10 rounded px-2 py-1"
        >
          <span className="font-mono text-red-400">{op.duration_ms}ms</span>
          <span className="font-mono text-muted-foreground">[{op.source}]</span>
          <span className="truncate flex-1">{op.operation}</span>
        </div>
      ))}
    </div>
  );
};

/**
 * Timeline of recent operations
 */
const Timeline: FC<{ operations: readonly OperationRecord[] }> = ({ operations }) => {
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  if (operations.length === 0) {
    return <div className="text-xs text-muted-foreground">No recent operations</div>;
  }

  return (
    <div className="space-y-0.5 max-h-32 overflow-auto font-mono text-xs">
      {operations.slice(0, 20).map((op, idx) => {
        const isBottleneck = op.duration_ms !== null && op.duration_ms > 500;
        const isEnd = op.duration_ms !== null;

        return (
          <div
            key={`${String(op.timestamp)}-${String(idx)}`}
            className={cn(
              'flex items-center gap-1 py-0.5 px-1 rounded',
              isBottleneck && 'bg-red-500/10'
            )}
          >
            <span className="text-muted-foreground w-16">{formatTime(op.timestamp)}</span>
            <span
              className={cn(
                'w-3 h-3 rounded-full shrink-0',
                SOURCE_COLORS[op.source] ?? 'bg-gray-500'
              )}
            />
            <span className="w-14 text-muted-foreground">[{op.source}]</span>
            <span className="truncate flex-1">{op.operation}</span>
            {isEnd ? (
              <span
                className={cn('w-14 text-right', isBottleneck ? 'text-red-400' : 'text-green-400')}
              >
                {op.duration_ms}ms
              </span>
            ) : (
              <span className="w-14 text-right text-blue-400">START</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ============================================
// Main Component
// ============================================

export const PerfDashboard: FC<PerfDashboardProps> = ({ open, onClose }) => {
  const [analysis, setAnalysis] = useState<PerformanceAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch performance data
  const refresh = useCallback(async (): Promise<void> => {
    if (!IS_DEV) return; // No-op in production
    setLoading(true);
    setError(null);
    try {
      const data = await analyzePerformance();
      setAnalysis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch performance data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Clear log handler
  const handleClear = useCallback(async (): Promise<void> => {
    if (!IS_DEV) return; // No-op in production
    try {
      await clearPerfLog();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear log');
    }
  }, [refresh]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    if (!IS_DEV || !open) return;

    void refresh();

    if (!autoRefresh) return;

    const interval = setInterval(() => {
      void refresh();
    }, 5000);

    return (): void => {
      clearInterval(interval);
    };
  }, [open, autoRefresh, refresh]);

  // Don't render in production or when closed
  if (!IS_DEV || !open) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 w-[500px] max-h-[600px] bg-card border border-border rounded-lg shadow-2xl z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">Performance Dashboard</span>
          {loading ? <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" /> : null}
        </div>
        <div className="flex items-center gap-1">
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e): void => {
                setAutoRefresh(e.target.checked);
              }}
              className="h-3 w-3"
            />
            Auto
          </label>
          <button
            onClick={(): void => {
              void refresh();
            }}
            className="p-1 hover:bg-accent rounded"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(): void => {
              void handleClear();
            }}
            className="p-1 hover:bg-accent rounded text-orange-400"
            title="Clear Log"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-accent rounded"
            title="Close (Ctrl+Shift+P)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 space-y-4">
        {error !== null ? (
          <div className="text-red-400 text-sm">{error}</div>
        ) : analysis === null ? (
          <div className="text-muted-foreground text-sm">Loading...</div>
        ) : (
          <>
            {/* Stats summary */}
            <div className="flex gap-4 text-xs">
              <div className="bg-muted px-2 py-1 rounded">
                <span className="text-muted-foreground">Entries:</span>{' '}
                <span className="font-mono">{analysis.total_entries}</span>
              </div>
              <div className="bg-muted px-2 py-1 rounded">
                <span className="text-muted-foreground">Operations:</span>{' '}
                <span className="font-mono">{analysis.total_operations}</span>
              </div>
              <div className="bg-muted px-2 py-1 rounded">
                <span className="text-muted-foreground">Bottlenecks:</span>{' '}
                <span
                  className={cn(
                    'font-mono',
                    analysis.bottlenecks.length > 0 ? 'text-red-400' : 'text-green-400'
                  )}
                >
                  {analysis.bottlenecks.length}
                </span>
              </div>
            </div>

            {/* Bar chart */}
            <div>
              <h3 className="text-xs font-medium mb-2 text-muted-foreground">
                Average Time by Source
              </h3>
              <BarChart data={analysis.by_source} />
            </div>

            {/* Summary table */}
            <div>
              <h3 className="text-xs font-medium mb-2 text-muted-foreground">Statistics</h3>
              <SummaryTable data={analysis.by_source} />
            </div>

            {/* Bottlenecks */}
            <div>
              <h3 className="text-xs font-medium mb-2 text-muted-foreground">
                Bottlenecks (&gt;500ms)
              </h3>
              <BottlenecksList operations={analysis.bottlenecks} />
            </div>

            {/* Timeline */}
            <div>
              <h3 className="text-xs font-medium mb-2 text-muted-foreground">Recent Timeline</h3>
              <Timeline operations={analysis.timeline} />
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-border bg-muted/30 text-xs text-muted-foreground">
        Press <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Ctrl+Shift+P</kbd> to toggle
      </div>
    </div>
  );
};

export default PerfDashboard;
