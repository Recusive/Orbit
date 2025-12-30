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
    <div>
      <div className="rounded-xl bg-card overflow-hidden shadow-[0_4px_12px_-4px_rgba(0,0,0,0.1),0_2px_6px_-2px_rgba(0,0,0,0.06)]">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-3.5 py-2.5">
          <div className="w-6 h-6 rounded-md flex items-center justify-center bg-primary/10">
            {isBash ? (
              <Terminal className="h-3.5 w-3.5 text-primary/70" />
            ) : (
              <File className="h-3.5 w-3.5 text-primary/70" />
            )}
          </div>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-[13px] font-medium text-foreground shrink-0">{confirmLabel}</span>
            <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
          </div>
        </div>

        {/* File path or command info */}
        {isFileTool(request.toolName) && filePath ? (
          <>
            <div className="h-px bg-border/30 mx-3.5" />
            <div className="px-3.5 py-2.5 bg-muted/30">
              <div className="text-[10px] font-medium tracking-wide text-muted-foreground/60 lowercase mb-1">
                file
              </div>
              <button
                type="button"
                onClick={handleFileClick}
                className="inline-flex items-center gap-1.5 group focus:outline-none"
              >
                <code className="bg-muted/50 text-foreground rounded-lg px-2 py-1 font-mono text-xs group-hover:bg-muted transition-colors truncate max-w-full">
                  {fileName}
                </code>
              </button>
              <div
                className="text-[10px] text-muted-foreground/50 font-mono mt-1 truncate"
                title={filePath}
              >
                {filePath}
              </div>
            </div>
          </>
        ) : null}

        {/* Action buttons */}
        <div className="h-px bg-border/30 mx-3.5" />
        <div className="flex items-center justify-end gap-2 px-3.5 py-2.5">
          <button
            onClick={handleDeny}
            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-muted/50 hover:bg-muted text-foreground shrink-0"
          >
            Reject <span className="text-muted-foreground/50 ml-1">⌘⌫</span>
          </button>
          <button
            onClick={handleApprove}
            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
          >
            Accept <span className="text-primary-foreground/60 ml-1">⌘⏎</span>
          </button>
        </div>
      </div>
    </div>
  );
};
