/**
 * useJankDetector - Real-time UI freeze detection with backend correlation
 *
 * DEV-ONLY: This hook only runs in development mode.
 *
 * Uses requestAnimationFrame to detect frame drops (>50ms), then correlates
 * with backend activity to identify what caused the freeze.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { OperationRecord, RecentPerfEvents } from '@/lib/api';

import { getRecentPerfEvents, isTauri } from '@/lib/api';

// ============================================
// Dev Mode Check
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

export interface JankEvent {
  /** Unique ID for this jank event */
  readonly id: string;
  /** Timestamp when jank was detected */
  readonly timestamp: number;
  /** Duration of the frame that caused jank (ms) */
  readonly frameDuration: number;
  /** Recent backend events that may have caused the jank */
  readonly backendEvents: readonly OperationRecord[];
  /** Whether this event has been dismissed by the user */
  dismissed: boolean;
}

export interface UseJankDetectorOptions {
  /** Enable/disable the detector (default: true in dev mode) */
  readonly enabled?: boolean;
  /** Threshold in ms to consider a frame as jank (default: 50ms) */
  readonly threshold?: number;
  /** Time window to fetch backend events (default: 2000ms) */
  readonly windowMs?: number;
  /** Maximum number of jank events to keep in history (default: 20) */
  readonly maxEvents?: number;
  /** Log jank to console (default: true) */
  readonly logToConsole?: boolean;
}

export interface UseJankDetectorReturn {
  /** Recent jank events */
  readonly events: readonly JankEvent[];
  /** Current jank event (most recent, if not dismissed) */
  readonly currentJank: JankEvent | null;
  /** Whether the detector is currently running */
  readonly isRunning: boolean;
  /** Dismiss a specific jank event */
  readonly dismissEvent: (id: string) => void;
  /** Clear all jank events */
  readonly clearEvents: () => void;
}

// ============================================
// Console Styling
// ============================================

const JANK_STYLE = 'color: #ff4444; font-weight: bold; font-size: 14px;';
const INFO_STYLE = 'color: #888888; font-size: 12px;';
const EVENT_STYLE = 'color: #4a9eff; font-size: 11px;';
const DURATION_SLOW = 'color: #ff8844; font-weight: bold;';
const DURATION_NORMAL = 'color: #44ff44;';

// ============================================
// Hook Implementation
// ============================================

export function useJankDetector(options: UseJankDetectorOptions = {}): UseJankDetectorReturn {
  const {
    enabled = IS_DEV,
    threshold = 50,
    windowMs = 2000,
    maxEvents = 20,
    logToConsole = true,
  } = options;

  const [events, setEvents] = useState<JankEvent[]>([]);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const rafIdRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);

  // Generate unique ID for jank events
  const generateId = useCallback((): string => {
    return `jank-${String(Date.now())}-${Math.random().toString(36).slice(2, 9)}`;
  }, []);

  // Format backend events for console logging
  const formatBackendEvents = useCallback((backendEvents: readonly OperationRecord[]): void => {
    if (backendEvents.length === 0) {
      // eslint-disable-next-line no-console
      console.log('%c  No backend activity detected in time window', INFO_STYLE);
      return;
    }

    // eslint-disable-next-line no-console
    console.log('%c  Recent backend activity:', INFO_STYLE);

    for (const event of backendEvents) {
      if (event.duration_ms !== null) {
        const durationStyle = event.duration_ms > 100 ? DURATION_SLOW : DURATION_NORMAL;
        // eslint-disable-next-line no-console
        console.log(
          `%c    [${event.source}] %c${event.operation} %c(${String(event.duration_ms)}ms)`,
          EVENT_STYLE,
          'color: inherit',
          durationStyle
        );
      } else {
        // eslint-disable-next-line no-console
        console.log(
          `%c    [${event.source}] %c${event.operation} %cSTART`,
          EVENT_STYLE,
          'color: inherit',
          'color: #4a9eff'
        );
      }
    }
  }, []);

  // Handle jank detection
  const handleJank = useCallback(
    async (frameDuration: number): Promise<void> => {
      const timestamp = Date.now();

      // Fetch recent backend events
      let backendEvents: readonly OperationRecord[] = [];
      try {
        if (isTauri()) {
          const result: RecentPerfEvents = await getRecentPerfEvents(windowMs);
          backendEvents = result.events;
        }
      } catch {
        // Ignore errors fetching backend events
      }

      // Create jank event
      const jankEvent: JankEvent = {
        id: generateId(),
        timestamp,
        frameDuration: Math.round(frameDuration),
        backendEvents,
        dismissed: false,
      };

      // Log to console
      if (logToConsole) {
        // eslint-disable-next-line no-console
        console.group(`%c[JANK] Frame took ${String(Math.round(frameDuration))}ms`, JANK_STYLE);
        formatBackendEvents(backendEvents);
        // eslint-disable-next-line no-console
        console.groupEnd();
      }

      // Add to events list
      setEvents((prev) => {
        const newEvents = [jankEvent, ...prev].slice(0, maxEvents);
        return newEvents;
      });
    },
    [windowMs, maxEvents, logToConsole, generateId, formatBackendEvents]
  );

  // RAF loop for frame time detection
  const frameLoop = useCallback(
    (currentTime: number): void => {
      const frameDuration = currentTime - lastFrameTimeRef.current;
      lastFrameTimeRef.current = currentTime;

      // Check for jank
      if (frameDuration > threshold) {
        void handleJank(frameDuration);
      }

      // Continue loop
      if (isRunningRef.current) {
        rafIdRef.current = requestAnimationFrame(frameLoop);
      }
    },
    [threshold, handleJank]
  );

  // Start/stop the detector
  useEffect(() => {
    // Don't run if not enabled or not in dev mode
    if (!enabled || !IS_DEV) {
      return;
    }

    isRunningRef.current = true;
    lastFrameTimeRef.current = performance.now();
    rafIdRef.current = requestAnimationFrame(frameLoop);

    // Log startup
    if (logToConsole) {
      // eslint-disable-next-line no-console
      console.log(
        `%c[JankDetector] Started monitoring (threshold: ${String(threshold)}ms)`,
        INFO_STYLE
      );
    }

    return (): void => {
      isRunningRef.current = false;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [enabled, threshold, frameLoop, logToConsole]);

  // Dismiss a specific event
  const dismissEvent = useCallback((id: string): void => {
    setEvents((prev) =>
      prev.map((event) => (event.id === id ? { ...event, dismissed: true } : event))
    );
  }, []);

  // Clear all events
  const clearEvents = useCallback((): void => {
    setEvents([]);
  }, []);

  // Get current (most recent non-dismissed) jank event
  const currentJank = events.find((e) => !e.dismissed) ?? null;

  return {
    events,
    currentJank,
    isRunning: isRunningRef.current && enabled && IS_DEV,
    dismissEvent,
    clearEvents,
  };
}

export default useJankDetector;
