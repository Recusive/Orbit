/**
 * Performance frame attribution monitor.
 *
 * Tracks real-time FPS and attributes frame drops to specific operations.
 * Dev-only — no-ops in production builds.
 *
 * Initialization (main.tsx):
 *   if (import.meta.env.DEV) {
 *     void import('./lib/perf').then(({ initPerfMonitor }) => initPerfMonitor());
 *   }
 *
 * Instrumentation:
 *   import { markOperation, onProfilerRender } from '@/lib/perf/frame-monitor';
 *
 *   // Manual marks for synchronous operations:
 *   const end = markOperation('store-commit');
 *   doWork();
 *   end();
 *
 *   // React Profiler for component subtrees:
 *   <Profiler id="streamdown" onRender={onProfilerRender}>
 *     <ExpensiveComponent />
 *   </Profiler>
 */

export { markEvent, markOperation, onProfilerRender, startFrameMonitor } from './frame-monitor';
export { mountPerfOverlay } from './PerfOverlay';

/** Start the monitor and mount the overlay. Returns cleanup. */
export async function initPerfMonitor(): Promise<() => void> {
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- no-op in production
  if (!import.meta.env.DEV) return () => {};
  // mountPerfOverlay internally calls startFrameMonitor
  const { mountPerfOverlay } = await import('./PerfOverlay');
  return mountPerfOverlay();
}
