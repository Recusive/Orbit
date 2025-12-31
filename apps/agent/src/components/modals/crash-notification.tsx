/**
 * CrashNotification - Dialog shown when a previous session crashed
 *
 * This component displays crash information from the previous session,
 * allowing users to view details or dismiss the notification.
 */

import { AlertTriangle, Copy, ExternalLink, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getCrashLogPath } from '@/lib/backend';
import { cn } from '@/lib/utils';

interface CrashNotificationProps {
  /** Whether the dialog is open */
  readonly open: boolean;
  /** Callback when dialog is closed */
  readonly onOpenChange: (open: boolean) => void;
  /** The crash log contents */
  readonly crashLog: string;
  /** Callback when user dismisses the notification */
  readonly onDismiss: () => void;
}

/**
 * Parse a crash log to extract the most recent crash summary.
 */
function extractCrashSummary(
  crashLog: string
): { message: string; location: string; timestamp: string } | null {
  const lines = crashLog.split('\n');
  let message = '';
  let location = '';
  let timestamp = '';

  for (const line of lines) {
    if (line.startsWith('Message: ')) {
      message = line.slice('Message: '.length);
    } else if (line.startsWith('Location: ')) {
      location = line.slice('Location: '.length);
    } else if (line.startsWith('Timestamp: ')) {
      timestamp = line.slice('Timestamp: '.length);
    }

    // Stop after first crash report
    if (line === '==================') {
      break;
    }
  }

  if (!message) return null;

  return { message, location, timestamp };
}

/**
 * Format a timestamp for display.
 */
function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString();
  } catch {
    return timestamp;
  }
}

export const CrashNotification: FC<CrashNotificationProps> = ({
  open,
  onOpenChange,
  crashLog,
  onDismiss,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [logPath, setLogPath] = useState<string | null>(null);

  const summary = extractCrashSummary(crashLog);

  const handleCopy = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(crashLog);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err: unknown) {
      console.error('Failed to copy crash log:', err);
    }
  }, [crashLog]);

  const handleViewLogFile = useCallback(async (): Promise<void> => {
    try {
      const path = await getCrashLogPath();
      setLogPath(path);
    } catch (err: unknown) {
      console.error('Failed to get crash log path:', err);
    }
  }, []);

  const handleDismiss = useCallback((): void => {
    onDismiss();
    onOpenChange(false);
  }, [onDismiss, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <span>Previous Session Crashed</span>
          </DialogTitle>
          <DialogDescription>
            Snowflake crashed unexpectedly during your last session. This information can help
            diagnose the issue.
          </DialogDescription>
        </DialogHeader>

        {/* Crash Summary */}
        {summary ? (
          <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
            <div>
              <div className="text-[10px] font-medium tracking-wide text-muted-foreground/60 uppercase mb-1">
                Error
              </div>
              <code className="text-sm text-destructive font-mono break-all">
                {summary.message}
              </code>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="text-[10px] font-medium tracking-wide text-muted-foreground/60 uppercase mb-1">
                  Location
                </div>
                <code className="text-xs text-muted-foreground font-mono">{summary.location}</code>
              </div>
              <div>
                <div className="text-[10px] font-medium tracking-wide text-muted-foreground/60 uppercase mb-1">
                  Time
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatTimestamp(summary.timestamp)}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Details Toggle */}
        <button
          type="button"
          onClick={() => {
            setShowDetails(!showDetails);
          }}
          className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
        >
          {showDetails ? 'Hide' : 'Show'} full crash log
          <ExternalLink className="h-3 w-3" />
        </button>

        {/* Full Crash Log */}
        {showDetails ? (
          <div className="space-y-2">
            <ScrollArea className="h-48 rounded-lg border border-border/50 bg-muted/20">
              <pre className="p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
                {crashLog}
              </pre>
            </ScrollArea>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  'text-xs flex items-center gap-1 transition-colors',
                  copied ? 'text-green-500' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Copy className="h-3 w-3" />
                {copied ? 'Copied!' : 'Copy to clipboard'}
              </button>

              {logPath ? (
                <code className="text-[10px] text-muted-foreground/50 font-mono">{logPath}</code>
              ) : (
                <button
                  type="button"
                  onClick={handleViewLogFile}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Show log path
                </button>
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleDismiss}>
            <X className="h-3.5 w-3.5 mr-1.5" />
            Dismiss
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={(): void => {
              onOpenChange(false);
            }}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
