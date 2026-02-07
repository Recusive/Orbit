/**
 * GitActions - Footer action buttons (Commit, Pull, Push)
 */
import { Download, GitCommit, Loader2, Upload } from 'lucide-react';
import React from 'react';

interface GitActionsProps {
  // Commit
  onCommit: () => Promise<void>;
  isCommitting: boolean;
  canCommit: boolean;
  // Pull
  onPull: () => Promise<void>;
  isPulling: boolean;
  // Push
  onPush: () => Promise<void>;
  isPushing: boolean;
}

export const GitActions: React.FC<GitActionsProps> = ({
  onCommit,
  isCommitting,
  canCommit,
  onPull,
  isPulling,
  onPush,
  isPushing,
}) => {
  const isSyncing = isPulling || isPushing;

  return (
    <div className="px-2 py-2 flex gap-1.5 border-t border-border/50">
      {/* Commit button - primary action */}
      <button
        onClick={() => void onCommit()}
        disabled={isCommitting || !canCommit}
        aria-label={isCommitting ? 'Committing changes...' : 'Commit staged changes'}
        className="
          flex-1 flex items-center justify-center gap-1.5
          h-7 rounded-lg text-sm font-medium
          bg-primary text-primary-foreground
          hover:bg-primary/90
          active:scale-[0.98] transition-[background-color,transform] duration-150
          disabled:opacity-30 disabled:cursor-not-allowed
        "
      >
        {isCommitting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <GitCommit className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Commit
      </button>

      {/* Pull button */}
      <button
        onClick={() => void onPull()}
        disabled={isSyncing}
        aria-label={isPulling ? 'Pulling changes...' : 'Pull from remote'}
        className="
          h-7 px-2.5 flex items-center justify-center gap-1 rounded-lg
          text-sm text-muted-foreground
          border-[3px] border-border/40
          hover:bg-muted/40 hover:text-foreground hover:border-border/60
          active:scale-[0.98] transition-[background-color,color,border-color,transform] duration-150
          disabled:opacity-30 disabled:cursor-not-allowed
        "
        title="Pull"
      >
        {isPulling ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>

      {/* Push button */}
      <button
        onClick={() => void onPush()}
        disabled={isSyncing}
        aria-label={isPushing ? 'Pushing changes...' : 'Push to remote'}
        className="
          h-7 px-2.5 flex items-center justify-center gap-1 rounded-lg
          text-sm text-muted-foreground
          border-[3px] border-border/40
          hover:bg-muted/40 hover:text-foreground hover:border-border/60
          active:scale-[0.98] transition-[background-color,color,border-color,transform] duration-150
          disabled:opacity-30 disabled:cursor-not-allowed
        "
        title="Push"
      >
        {isPushing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
};
