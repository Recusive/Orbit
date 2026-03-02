import { ArrowLeft, AlertTriangle } from 'lucide-react';

import type { VaultSaveState } from '@/features/vault/stores';
import type { UnifiedDoc } from '@/features/vault/types';
import type { FC } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VaultDocHeaderProps {
  readonly doc: UnifiedDoc | null;
  readonly saveState: VaultSaveState;
  readonly isDocModified: boolean;
  readonly canSave: boolean;
  readonly canSend: boolean;
  readonly onCloseVault: () => void;
  readonly onSendToAgent: () => void;
  readonly onSave: () => void;
  readonly onReload: () => void;
  readonly onOverwrite: () => void;
}

function statusLabel(saveState: VaultSaveState, isDocModified: boolean): string {
  if (saveState === 'saving') return 'Saving';
  if (saveState === 'saved') return 'Saved';
  if (saveState === 'conflicted') return 'Conflict';
  if (saveState === 'error') return 'Error';
  if (isDocModified) return 'Modified';
  return 'Synced';
}

export const VaultDocHeader: FC<VaultDocHeaderProps> = ({
  doc,
  saveState,
  isDocModified,
  canSave,
  canSend,
  onCloseVault,
  onSendToAgent,
  onSave,
  onReload,
  onOverwrite,
}) => {
  const label = statusLabel(saveState, isDocModified);
  const isConflict = saveState === 'conflicted';

  return (
    <header className="h-11 border-b border-lg-separator px-3 flex items-center justify-between gap-3 bg-chat-area">
      <div className="flex items-center gap-2 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onCloseVault}
          title="Close vault"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{doc ? doc.name : 'Vault'}</p>
          <p className="text-xs text-muted-foreground truncate">
            {doc ? doc.relativePath : 'Select a document'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={cn(
            'text-xs px-2 py-1 rounded-full border',
            isConflict
              ? 'border-warning text-warning-foreground bg-warning-muted'
              : 'border-lg-separator text-muted-foreground'
          )}
        >
          {isConflict ? (
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {label}
            </span>
          ) : (
            label
          )}
        </span>
        {isConflict ? (
          <>
            <Button variant="secondary" size="sm" onClick={onReload}>
              Reload
            </Button>
            <Button variant="destructive" size="sm" onClick={onOverwrite}>
              Overwrite
            </Button>
          </>
        ) : null}
        <Button variant="secondary" size="sm" onClick={onSave} disabled={!canSave}>
          Save
        </Button>
        <Button size="sm" onClick={onSendToAgent} disabled={!canSend}>
          Send to Agent
        </Button>
      </div>
    </header>
  );
};
