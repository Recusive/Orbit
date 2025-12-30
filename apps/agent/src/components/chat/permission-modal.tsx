import { File, Loader2, Terminal } from 'lucide-react';
import { useCallback, useEffect } from 'react';

import type { PermissionRequest } from '@/stores/tool-store';
import type { FC } from 'react';

interface PermissionModalProps {
  readonly request: PermissionRequest;
  readonly onApprove: (requestId: string, always?: boolean) => void;
  readonly onDeny: (requestId: string) => void;
  readonly onOpenFile?: (path: string) => void;
}

// Get confirmation action label
function getConfirmLabel(toolName: string): string {
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

function getFileName(filePath: string | undefined): string {
  if (!filePath) return 'file';
  const parts = filePath.split('/');
  return parts[parts.length - 1] ?? filePath;
}

// Check if tool is file-related
function isFileTool(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return ['read', 'write', 'edit', 'glob'].includes(name);
}

export const PermissionModal: FC<PermissionModalProps> = ({
  request,
  onApprove,
  onDeny,
  onOpenFile,
}) => {
  const confirmLabel = getConfirmLabel(request.toolName);
  const filePath = request.toolInput['file_path'] as string | undefined;
  const fileName = getFileName(filePath);
  const isBash = request.toolName.toLowerCase() === 'bash';

  const handleFileClick = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (filePath) {
        onOpenFile?.(filePath);
      }
    },
    [filePath, onOpenFile]
  );

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
    <div className="my-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
      <div className="flex items-center gap-2">
        {/* Spinner */}
        <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />

        {/* Confirm label */}
        <span className="text-sm font-medium text-primary shrink-0">{confirmLabel}</span>

        {/* File anchor or terminal icon */}
        {isFileTool(request.toolName) ? (
          <button
            type="button"
            onClick={handleFileClick}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted hover:bg-accent transition-colors cursor-pointer min-w-0"
            title={filePath}
          >
            <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm truncate">{fileName}</span>
          </button>
        ) : isBash ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted">
            <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        ) : null}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Buttons */}
        <button
          onClick={handleDeny}
          className="px-2.5 py-1 text-xs font-medium rounded transition-colors bg-muted hover:bg-accent text-foreground shrink-0"
        >
          Reject <span className="opacity-50">⇧⌘⌫</span>
        </button>
        <button
          onClick={handleApprove}
          className="px-2.5 py-1 text-xs font-medium rounded transition-colors bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
        >
          Accept <span className="opacity-50">⌘⏎</span>
        </button>
      </div>
    </div>
  );
};
