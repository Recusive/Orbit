import { File, Globe, Loader2, Terminal } from 'lucide-react';
import { useCallback, useEffect } from 'react';

import type { PermissionRequest } from '@/stores/agent/tool-store';
import type { FC } from 'react';

import { cn, formatMcpToolName, isBrowserTool } from '@/lib/utils';

interface PermissionModalProps {
  readonly request: PermissionRequest;
  readonly onApprove: (requestId: string, always?: boolean) => void;
  readonly onDeny: (requestId: string) => void;
  /** Whether this is the last permission in the list (controls bottom separator) */
  readonly isLast?: boolean;
}

// Get confirmation action label
function getConfirmLabel(toolName: string): string {
  // Try to format as MCP tool first
  const mcpLabel = formatMcpToolName(toolName);
  if (mcpLabel) {
    return mcpLabel;
  }

  const name = toolName.toLowerCase();
  switch (name) {
    case 'bash':
      return 'Confirm run';
    case 'read':
      return 'Confirm read';
    case 'write':
      return 'Confirm write';
    case 'edit':
      return 'Confirm edit';
    case 'glob':
      return 'Confirm search';
    case 'grep':
      return 'Confirm search';
    default:
      return `Confirm ${toolName.toLowerCase()}`;
  }
}

export const PermissionModal: FC<PermissionModalProps> = ({
  request,
  onApprove,
  onDeny,
  isLast = true,
}) => {
  const confirmLabel = getConfirmLabel(request.toolName);
  const isBash = request.toolName.toLowerCase() === 'bash';
  const isBrowser = isBrowserTool(request.toolName);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'Enter') {
          e.preventDefault();
          onApprove(request.requestId);
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          onDeny(request.requestId);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [request.requestId, onApprove, onDeny]);

  const handleApprove = useCallback(() => {
    onApprove(request.requestId);
  }, [request.requestId, onApprove]);

  const handleDeny = useCallback(() => {
    onDeny(request.requestId);
  }, [request.requestId, onDeny]);

  return (
    <div
      className={cn(
        'animate-permission-in overflow-hidden',
        !isLast && 'border-b border-border/30'
      )}
    >
      {/* Single row: Icon + Label + Loader + Buttons */}
      <div className="flex items-center gap-2.5 px-3.5 py-2">
        {/* Icon */}
        <div className="w-6 h-6 rounded-md flex items-center justify-center bg-primary/10">
          {isBash ? (
            <Terminal className="h-3.5 w-3.5 text-primary/70" />
          ) : isBrowser ? (
            <Globe className="h-3.5 w-3.5 text-primary/70" />
          ) : (
            <File className="h-3.5 w-3.5 text-primary/70" />
          )}
        </div>

        {/* Label + Loader */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-base font-medium text-foreground shrink-0">{confirmLabel}</span>
          <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDeny}
            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-muted/50 hover:bg-muted text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Reject <span className="text-muted-foreground/50 ml-1">⌘⌫</span>
          </button>
          <button
            onClick={handleApprove}
            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Accept <span className="text-primary-foreground/60 ml-1">⌘⏎</span>
          </button>
        </div>
      </div>
    </div>
  );
};
