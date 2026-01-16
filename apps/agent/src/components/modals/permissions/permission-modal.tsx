import { File, Globe, Loader2, Terminal } from 'lucide-react';
import { useCallback, useEffect } from 'react';

import type { PermissionRequest } from '@/stores/agent/tool-store';
import type { FC } from 'react';

interface PermissionModalProps {
  readonly request: PermissionRequest;
  readonly onApprove: (requestId: string, always?: boolean) => void;
  readonly onDeny: (requestId: string) => void;
  readonly onOpenFile?: (path: string) => void;
}

// Format MCP tool names like "mcp__orbit-browser__browser_open" to "Browser: Open"
function formatMcpToolName(toolName: string): string | null {
  if (!toolName.startsWith('mcp__')) {
    return null;
  }

  const parts = toolName.split('__');
  const provider = parts[1];
  const actionParts = parts.slice(2);

  if (!provider || actionParts.length === 0) {
    return null;
  }

  const action = actionParts.join('__'); // e.g., "browser_open"

  // Map provider names to display names
  const providerDisplayNames: Record<string, string> = {
    'orbit-browser': 'Browser',
    'claude-in-chrome': 'Browser',
    plugin_playwright_playwright: 'Playwright',
  };

  const displayProvider = providerDisplayNames[provider] ?? provider;

  // Extract action name (remove provider prefix if present)
  // e.g., "browser_open" → "open", "browser_navigate" → "navigate"
  let actionName = action;
  if (action.startsWith('browser_')) {
    actionName = action.slice(8); // Remove "browser_" prefix
  }

  // Capitalize and format action name
  // e.g., "open" → "Open", "take_screenshot" → "Take Screenshot"
  const formattedAction = actionName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return `${displayProvider}: ${formattedAction}`;
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

// Check if tool is a browser-related MCP tool
function isBrowserTool(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return (
    name.includes('browser') || name.includes('orbit-browser') || name.includes('claude-in-chrome')
  );
}

export const PermissionModal: FC<PermissionModalProps> = ({ request, onApprove, onDeny }) => {
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
    <div className="rounded-t-xl bg-card border border-border/50 border-b-0 overflow-hidden shadow-up">
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
            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-muted/50 hover:bg-muted text-foreground"
          >
            Reject <span className="text-muted-foreground/50 ml-1">⌘⌫</span>
          </button>
          <button
            onClick={handleApprove}
            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Accept <span className="text-primary-foreground/60 ml-1">⌘⏎</span>
          </button>
        </div>
      </div>
    </div>
  );
};
