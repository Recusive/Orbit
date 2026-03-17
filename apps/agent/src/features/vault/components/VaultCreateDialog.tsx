import { IconNoteText } from '@central-icons-react/round-outlined-radius-1-stroke-2/IconNoteText';
import { X } from 'lucide-react';
import { useCallback, useState } from 'react';

import type { FC } from 'react';

import {
  Dialog,
  DialogClose,
  DialogContentGlass,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

type CreateMode = 'file' | 'folder';

interface VaultCreateDialogProps {
  readonly open: boolean;
  readonly currentPath: string;
  readonly onClose: () => void;
  readonly onCreateFile: (relativePath: string, initialContent?: string) => Promise<void>;
  readonly onCreateFolder: (relativePath: string) => Promise<void>;
}

function sanitizeFileName(name: string): string {
  // Remove characters unsafe for filenames: < > : " / \ | ? * and control chars (0-31)
  let result = '';
  for (const ch of name) {
    const code = ch.charCodeAt(0);
    if (code < 32) continue;
    if ('<>:"/\\|?*'.includes(ch)) continue;
    result += ch;
  }
  return result.trim();
}

export const VaultCreateDialog: FC<VaultCreateDialogProps> = ({
  open,
  currentPath,
  onClose,
  onCreateFile,
  onCreateFolder,
}) => {
  const [mode, setMode] = useState<CreateMode>('file');
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleOpenChange = useCallback(
    (nextOpen: boolean): void => {
      if (!nextOpen) {
        onClose();
        setName('');
        setError('');
        setIsCreating(false);
        setMode('file');
      }
    },
    [onClose]
  );

  const handleCreate = useCallback(async (): Promise<void> => {
    const sanitized = sanitizeFileName(name);
    if (sanitized.length === 0) {
      setError('Name cannot be empty.');
      return;
    }

    const finalName = mode === 'file' && !sanitized.includes('.') ? `${sanitized}.md` : sanitized;
    const relativePath = currentPath.length > 0 ? `${currentPath}/${finalName}` : finalName;

    setIsCreating(true);
    setError('');

    try {
      if (mode === 'folder') {
        await onCreateFolder(relativePath);
      } else {
        await onCreateFile(relativePath, `# ${sanitized.replace(/\.[^.]+$/, '')}\n\n`);
      }
      setName('');
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsCreating(false);
    }
  }, [name, mode, currentPath, onCreateFile, onCreateFolder, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Enter' && !isCreating) {
        e.preventDefault();
        void handleCreate();
      }
    },
    [handleCreate, isCreating]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContentGlass className="w-[360px] gap-0 overflow-hidden p-0 glass-surface [&>.absolute]:hidden">
        <DialogClose className="absolute right-3 top-3 z-10 rounded-[9px] p-1 bg-foreground/8 text-muted-foreground/50 transition-all duration-150 hover:bg-destructive-subtle hover:text-destructive-text">
          <X className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">Close</span>
        </DialogClose>

        <div className="relative flex flex-col items-center gap-4 px-4 pb-4 pt-5">
          {/* Icon */}
          <div className="flex w-full items-center px-1.5">
            <div className="liquid-glass-icon flex shrink-0 items-center justify-center bg-primary/10">
              <IconNoteText className="h-7 w-7 text-primary" />
            </div>
          </div>

          {/* Title + Description */}
          <div className="flex w-full flex-col items-start gap-2.5 px-1.5 pb-0.5">
            <DialogTitle className="liquid-glass-title w-full">
              Create new {mode === 'file' ? 'document' : 'folder'}
            </DialogTitle>
            <DialogDescription className="liquid-glass-desc w-full">
              {currentPath.length > 0
                ? `New ${mode === 'file' ? 'document' : 'folder'} will be created in ${currentPath}/`
                : `New ${mode === 'file' ? 'document' : 'folder'} will be created in the vault root.`}
            </DialogDescription>
          </div>

          {/* Mode toggle */}
          <div className="flex w-full items-center gap-2 px-1.5">
            <button
              type="button"
              className={`liquid-glass-btn flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97] ${
                mode === 'file' ? 'liquid-glass-btn-secondary' : ''
              }`}
              onClick={() => {
                setMode('file');
              }}
            >
              Document
            </button>
            <button
              type="button"
              className={`liquid-glass-btn flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97] ${
                mode === 'folder' ? 'liquid-glass-btn-secondary' : ''
              }`}
              onClick={() => {
                setMode('folder');
              }}
            >
              Folder
            </button>
          </div>

          {/* Name input */}
          <div className="w-full px-1.5">
            <div className="relative">
              <IconNoteText className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <input
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                onKeyDown={handleKeyDown}
                placeholder={mode === 'file' ? 'my-notes.md' : 'folder-name'}
                className="liquid-glass-textarea liquid-glass-textarea-icon h-9 w-full rounded-[9px] text-sm outline-none"
                aria-label={mode === 'file' ? 'Document name' : 'Folder name'}
                disabled={isCreating}
              />
            </div>
            {error.length > 0 ? (
              <p className="mt-1.5 text-[12px] text-destructive">{error}</p>
            ) : null}
          </div>

          {/* Buttons */}
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-secondary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
              onClick={onClose}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="button"
              className="liquid-glass-btn liquid-glass-btn-primary flex-1 cursor-pointer transition-transform duration-75 active:scale-[0.97]"
              onClick={() => {
                void handleCreate();
              }}
              disabled={isCreating || name.trim().length === 0}
            >
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      </DialogContentGlass>
    </Dialog>
  );
};
