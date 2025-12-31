/**
 * CodeMirror wrapper for dev-monitor.
 *
 * Creates a ViewPlugin that monitors editor updates, including:
 * - Document changes
 * - Slow updates (exceeding threshold)
 * - Selection changes
 * - Focus changes
 *
 * Follows the error isolation pattern - monitoring errors never crash the editor.
 */

import { ViewPlugin } from '@codemirror/view';

import { captureEvent } from '../storage';

import type { CodeMirrorOptions } from '../types';
import type { Extension } from '@codemirror/state';
import type { PluginValue, ViewUpdate } from '@codemirror/view';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Internal state for the monitoring plugin */
interface MonitorPluginState {
  updateCount: number;
  lastUpdateTime: number;
  docSize: number;
}

// ═══════════════════════════════════════════════════════════════
// CodeMirror Wrapper
// ═══════════════════════════════════════════════════════════════

/**
 * Wrap CodeMirror extensions to add monitoring.
 *
 * Adds a ViewPlugin that monitors all editor updates without
 * affecting the editor's normal operation.
 *
 * @example
 * const extensions = codemirrorWrapper('MainEditor', [javascript(), oneDark]);
 */
export function codemirrorWrapper(
  name: string,
  extensions: Extension[],
  options: CodeMirrorOptions = {}
): Extension[] {
  const { slowThreshold = 16 } = options;

  // Create monitoring plugin
  const monitorPlugin = ViewPlugin.define<PluginValue & MonitorPluginState>((view) => {
    // Initial state
    const state: MonitorPluginState = {
      updateCount: 0,
      lastUpdateTime: performance.now(),
      docSize: view.state.doc.length,
    };

    // Log initialization
    try {
      captureEvent({
        severity: 'info',
        category: 'codemirror:init',
        file: `editor:${name}`,
        function: 'create',
        title: `${name} editor initialized`,
        context: {
          docSize: state.docSize,
          lines: view.state.doc.lines,
        },
      });
    } catch (err: unknown) {
      console.error('[DevMonitor] codemirror init capture failed:', err);
    }

    return {
      ...state,

      update(update: ViewUpdate): void {
        const updateStart = performance.now();

        try {
          this.updateCount += 1;

          // Track document changes
          if (update.docChanged) {
            const newDocSize = update.state.doc.length;
            const sizeDelta = newDocSize - this.docSize;
            this.docSize = newDocSize;

            captureEvent({
              severity: 'info',
              category: 'codemirror:docChange',
              file: `editor:${name}`,
              function: 'update',
              title: `${name} doc changed`,
              context: {
                updateCount: this.updateCount,
                docSize: newDocSize,
                sizeDelta,
                lines: update.state.doc.lines,
                transactions: update.transactions.length,
              },
            });
          }

          // Track selection changes
          if (update.selectionSet && !update.docChanged) {
            const selection = update.state.selection.main;
            captureEvent({
              severity: 'info',
              category: 'codemirror:selection',
              file: `editor:${name}`,
              function: 'update',
              title: `${name} selection changed`,
              context: {
                anchor: selection.anchor,
                head: selection.head,
                empty: selection.empty,
              },
            });
          }

          // Track focus changes
          if (update.focusChanged) {
            captureEvent({
              severity: 'info',
              category: update.view.hasFocus ? 'codemirror:focus' : 'codemirror:blur',
              file: `editor:${name}`,
              function: 'update',
              title: `${name} ${update.view.hasFocus ? 'focused' : 'blurred'}`,
              context: {},
            });
          }

          // Check for slow updates
          const updateDuration = performance.now() - updateStart;
          if (updateDuration > slowThreshold) {
            captureEvent({
              severity: 'perf',
              category: 'codemirror:slow',
              file: `editor:${name}`,
              function: 'update',
              title: `${name} slow update (${updateDuration.toFixed(1)}ms)`,
              context: {
                duration_ms: updateDuration,
                threshold_ms: slowThreshold,
                updateCount: this.updateCount,
                docChanged: update.docChanged,
                transactions: update.transactions.length,
              },
            });
          }

          this.lastUpdateTime = updateStart;
        } catch (err: unknown) {
          console.error('[DevMonitor] codemirror update capture failed:', err);
        }
      },

      destroy(): void {
        try {
          captureEvent({
            severity: 'info',
            category: 'codemirror:destroy',
            file: `editor:${name}`,
            function: 'destroy',
            title: `${name} editor destroyed`,
            context: {
              totalUpdates: this.updateCount,
              finalDocSize: this.docSize,
            },
          });
        } catch (err: unknown) {
          console.error('[DevMonitor] codemirror destroy capture failed:', err);
        }
      },
    };
  });

  // Return original extensions plus our monitoring plugin
  // Monitoring plugin goes first to ensure it's always included
  return [monitorPlugin, ...extensions];
}
