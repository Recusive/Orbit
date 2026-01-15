/**
 * StatusAnnouncer - Screen reader announcements for async status changes
 *
 * This component uses aria-live regions to announce status changes to
 * screen reader users. The visual content is hidden (sr-only) but
 * announced by assistive technology.
 *
 * @example
 * <StatusAnnouncer
 *   isLoading={isAgentRunning}
 *   loadingMessage="Agent is thinking..."
 *   completeMessage="Response complete"
 * />
 */
import type { FC } from 'react';

interface StatusAnnouncerProps {
  /** Whether a loading/processing state is active */
  readonly isLoading: boolean;
  /** Message to announce when loading starts */
  readonly loadingMessage?: string;
  /** Message to announce when loading completes */
  readonly completeMessage?: string;
  /** Optional additional status text */
  readonly statusText?: string;
  /** Politeness level for announcements (default: polite) */
  readonly politeness?: 'polite' | 'assertive';
}

/**
 * Announces status changes to screen readers.
 * Uses sr-only to hide from visual users while keeping accessible.
 */
export const StatusAnnouncer: FC<StatusAnnouncerProps> = ({
  isLoading,
  loadingMessage = 'Loading...',
  completeMessage = 'Complete',
  statusText,
  politeness = 'polite',
}) => {
  const message = isLoading ? loadingMessage : completeMessage;

  return (
    <div role="status" aria-live={politeness} aria-atomic="true" className="sr-only">
      {statusText ?? message}
    </div>
  );
};
