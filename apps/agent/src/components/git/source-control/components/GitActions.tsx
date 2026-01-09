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
    <div className="p-3 flex gap-2">
      {/* Commit button */}
      <button
        onClick={() => void onCommit()}
        disabled={isCommitting || !canCommit}
        className="
          flex-1 flex items-center justify-center gap-2
          px-3 py-1.5 rounded-lg text-sm font-medium
          bg-primary/90 text-primary-foreground shadow-sm
          hover:bg-primary hover:shadow
          active:scale-[0.98] transition-all duration-200
          disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
        "
      >
        {isCommitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GitCommit className="h-4 w-4" />
        )}
        Commit
      </button>

      {/* Pull button */}
      <button
        onClick={() => void onPull()}
        disabled={isSyncing}
        className="
          px-3 py-1.5 rounded-lg
          border border-border/50 hover:bg-muted/50 hover:border-border/70
          text-sm
          active:scale-[0.98] transition-all duration-150
          disabled:opacity-40 disabled:cursor-not-allowed
        "
        title="Pull"
      >
        {isPulling ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </button>

      {/* Push button */}
      <button
        onClick={() => void onPush()}
        disabled={isSyncing}
        className="
          px-3 py-1.5 rounded-lg
          border border-border/50 hover:bg-muted/50 hover:border-border/70
          text-sm
          active:scale-[0.98] transition-all duration-150
          disabled:opacity-40 disabled:cursor-not-allowed
        "
        title="Push"
      >
        {isPushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
      </button>
    </div>
  );
};
