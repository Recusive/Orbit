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
    <div className="px-3 py-2 flex gap-1.5 border-b border-lg-separator">
      {/* Commit button - primary action */}
      <button
        onClick={() => void onCommit()}
        disabled={isCommitting || !canCommit}
        aria-label={isCommitting ? 'Committing changes...' : 'Commit staged changes'}
        className="
          flex-1 flex items-center justify-center gap-1.5
          h-7 rounded-lg text-sm font-medium
          bg-foreground text-background
          hover:bg-foreground/90
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
          border border-lg-separator
          hover:bg-lg-control-hover hover:text-foreground hover:border-lg-border
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
          border border-lg-separator
          hover:bg-lg-control-hover hover:text-foreground hover:border-lg-border
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
