/**
 * JankIndicator - Visual flash overlay when UI jank is detected
 *
 * DEV-ONLY: This component only renders in development mode.
 *
 * Shows a brief red flash at the top of the screen when jank is detected,
 * with the frame duration displayed. Automatically fades out.
 */

import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { JankEvent } from '@/hooks/debug';
import type { FC } from 'react';

import { cn } from '@/lib/utils/utils';

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

interface JankIndicatorProps {
  /** Current jank event to display (or null if none) */
  readonly jankEvent: JankEvent | null;
  /** Callback to dismiss the jank event */
  readonly onDismiss: (id: string) => void;
  /** Auto-hide after this many milliseconds (default: 3000, 0 = never) */
  readonly autoHideMs?: number;
}

// ============================================
// Component
// ============================================

export const JankIndicator: FC<JankIndicatorProps> = ({
  jankEvent,
  onDismiss,
  autoHideMs = 3000,
}) => {
  const [visible, setVisible] = useState(false);
  const [opacity, setOpacity] = useState(0);

  // Handle visibility and animation
  useEffect(() => {
    if (!IS_DEV || jankEvent === null) {
      setVisible(false);
      setOpacity(0);
      return undefined;
    }

    // Show immediately
    setVisible(true);
    setOpacity(1);

    // Auto-hide after delay
    if (autoHideMs > 0) {
      const fadeTimer = setTimeout(() => {
        setOpacity(0);
      }, autoHideMs - 300); // Start fade 300ms before hide

      const hideTimer = setTimeout(() => {
        setVisible(false);
        onDismiss(jankEvent.id);
      }, autoHideMs);

      return (): void => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    }

    return undefined;
  }, [jankEvent, autoHideMs, onDismiss]);

  // Don't render in production or when not visible
  if (!IS_DEV || !visible || jankEvent === null) {
    return null;
  }

  const getSeverityColor = (duration: number): string => {
    if (duration > 200) return 'bg-red-600';
    if (duration > 100) return 'bg-orange-500';
    return 'bg-yellow-500';
  };

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-[9999] pointer-events-none',
        'transition-opacity duration-300'
      )}
      style={{ opacity }}
    >
      {/* Red flash overlay */}
      <div
        className={cn(
          'absolute inset-0 h-1',
          getSeverityColor(jankEvent.frameDuration),
          'animate-pulse'
        )}
      />

      {/* Info badge */}
      <div className="flex justify-center pt-2">
        <div
          className={cn(
            'pointer-events-auto',
            'flex items-center gap-2 px-3 py-1.5 rounded-full shadow-lg',
            getSeverityColor(jankEvent.frameDuration),
            'text-white text-xs font-medium'
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>
            JANK: {jankEvent.frameDuration}ms
            {jankEvent.backendEvents.length > 0
              ? ` (${String(jankEvent.backendEvents.length)} backend ops)`
              : ''}
          </span>
          <button
            onClick={(): void => {
              onDismiss(jankEvent.id);
            }}
            className="ml-1 p-0.5 rounded hover:bg-white/20"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default JankIndicator;
