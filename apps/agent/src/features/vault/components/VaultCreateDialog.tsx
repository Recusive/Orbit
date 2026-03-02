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
import { Input } from '@/components/ui/input';

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
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Create New {mode === 'file' ? 'Document' : 'Folder'}</DialogTitle>
          <DialogDescription>
            {currentPath.length > 0 ? `In: ${currentPath}/` : 'In vault root'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 py-1">
          <Button
            variant={mode === 'file' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => {
              setMode('file');
            }}
          >
            Document
          </Button>
          <Button
            variant={mode === 'folder' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => {
              setMode('folder');
            }}
          >
            Folder
          </Button>
        </div>

        <Input
          placeholder={mode === 'file' ? 'my-notes.md' : 'folder-name'}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          onKeyDown={handleKeyDown}
          autoFocus
          disabled={isCreating}
        />

        {error.length > 0 ? <p className="text-xs text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void handleCreate()}
            disabled={isCreating || name.trim().length === 0}
          >
            {isCreating ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
